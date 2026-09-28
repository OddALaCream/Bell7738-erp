function readEnv(key: string, fallback?: string): string {
  const value = import.meta.env[key] as string | undefined;
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  apiBaseUrl: readEnv('VITE_API_BASE_URL', 'http://localhost:3000/api/v1'),
};
