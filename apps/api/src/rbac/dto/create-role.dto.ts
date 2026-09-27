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
} from 'class-validator';

// Matches the DB's CHECK (color ~ '^#[0-9A-Fa-f]{6}$') from Phase 3.
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export class CreateRoleDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @Matches(HEX_COLOR, { message: 'color must be a hex value like #336699' })
  color!: string;

  @IsInt()
  @Min(0)
  position!: number;

  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  permissionIds: string[] = [];
}
