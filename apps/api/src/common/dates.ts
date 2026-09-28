/**
 * Prisma's `@db.Date` columns require a Date (or full ISO-8601 timestamp),
 * not a bare `YYYY-MM-DD` string — class-validator's `@IsDateString` only
 * guarantees the string is *parseable*, so callers must convert before
 * handing a DTO's date field to Prisma.
 */
export function toDateOrUndefined(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

export function toDateOrNull(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}
