import { IsString, MaxLength, ValidateIf } from 'class-validator';

/** Deliberately excludes email/status/roles — docs/API.md: those "no entran en este DTO". */
export class UpdateProfileDto {
  // @ValidateIf (not @IsOptional): an explicit `null` must be rejected as
  // 400, not silently treated as "not provided" against a NOT NULL column.
  @ValidateIf((o) => o.firstName !== undefined)
  @IsString()
  @MaxLength(200)
  firstName?: string;

  @ValidateIf((o) => o.lastName !== undefined)
  @IsString()
  @MaxLength(200)
  lastName?: string;
}
