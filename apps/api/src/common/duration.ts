import ms from 'ms';

/**
 * `ms`'s types require its branded `StringValue` literal type, but our TTL
 * config values (ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL) are validated at
 * runtime by Zod, not by TypeScript's type system — hence the one cast,
 * centralized here instead of repeated at every call site.
 */
type MsStringValue = Parameters<typeof ms>[0] & string;

export function durationToMs(value: string): number {
  return ms(value as MsStringValue);
}

export function durationToSeconds(value: string): number {
  return Math.floor(durationToMs(value) / 1000);
}
