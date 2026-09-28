import axios, { AxiosError, type AxiosRequestConfig, type AxiosInstance } from 'axios';
import { env } from './env';
import { ApiError, type ApiErrorBody } from './api-types';

/**
 * Access tokens live only in memory (docs/ARCHITECTURE.md: "no se guardan
 * tokens en localStorage"). This module module-scopes the current token and
 * a single in-flight refresh promise so concurrent 401s trigger exactly one
 * `/auth/refresh` call instead of a stampede.
 */
let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Registered once by the auth provider so the client can react to a failed refresh. */
export function registerSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

export const http: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  withCredentials: true,
});

http.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
});

interface RetriableConfig extends AxiosRequestConfig {
  _retried?: boolean;
}

async function performRefresh(): Promise<string | null> {
  try {
    const response = await axios.post<{ accessToken: string; expiresIn: number }>(
      '/auth/refresh',
      undefined,
      { baseURL: env.apiBaseUrl, withCredentials: true },
    );
    const token = response.data.accessToken;
    setAccessToken(token);
    return token;
  } catch {
    setAccessToken(null);
    return null;
  }
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;
    const isAuthEndpoint = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');

    if (status === 401 && original && !original._retried && !isAuthEndpoint) {
      original._retried = true;
      if (!refreshPromise) {
        refreshPromise = performRefresh().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      if (newToken) {
        original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` };
        return http(original);
      }
      onSessionExpired?.();
    }

    if (error.response?.data?.error) {
      throw new ApiError(status ?? 0, error.response.data.error);
    }

    throw new ApiError(status ?? 0, {
      code: code ?? 'NETWORK_ERROR',
      message: error.message || 'No se pudo conectar con el servidor.',
    });
  },
);
