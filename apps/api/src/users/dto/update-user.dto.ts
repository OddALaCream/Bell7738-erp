import { IsEmail, IsString, MaxLength, ValidateIf } from 'class-validator';

// @ValidateIf (not @IsOptional) so an explicit `null` is validated and
// rejected as 400 instead of slipping through as "not provided" — these
// are all NOT NULL columns, and @IsOptional treats null the same as
// undefined, which previously reached normalizeEmail(null) and crashed.
export class UpdateUserDto {
  @ValidateIf((o) => o.firstName !== undefined)
  @IsString()
  @MaxLength(200)
  firstName?: string;

  @ValidateIf((o) => o.lastName !== undefined)
  @IsString()
  @MaxLength(200)
  lastName?: string;

  @ValidateIf((o) => o.email !== undefined)
  @IsEmail()
  @MaxLength(320)
  email?: string;
}
