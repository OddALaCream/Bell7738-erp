import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export class UpdateRoleDto {
  // NOT NULL columns: @ValidateIf (not @IsOptional) so an explicit `null`
  // is rejected as 400 rather than silently ignored or reaching the DB.
  @ValidateIf((o) => o.name !== undefined)
  @IsString()
  @MaxLength(100)
  name?: string;

  // `description` is nullable in the DB — null here is a meaningful
  // "clear the description", not an invalid value, so @IsOptional is right.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ValidateIf((o) => o.color !== undefined)
  @IsString()
  @Matches(HEX_COLOR, { message: 'color must be a hex value like #336699' })
  color?: string;

  @ValidateIf((o) => o.position !== undefined)
  @IsInt()
  @Min(0)
  position?: number;

  // If provided, this is the complete new permission set (not a diff).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  permissionIds?: string[];
}
