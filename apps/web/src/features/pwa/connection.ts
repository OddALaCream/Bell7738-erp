import { ApiError } from '@/lib/api-types';

/**
 * A request that never got an HTTP answer (offline, DNS, server down): the
 * API client reports those as status 0. A 4xx/5xx means the server *is*
 * reachable, so it must not trigger the "sin conexión" banner.
 */
export function isNetworkFailure(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0;
}
