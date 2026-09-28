import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateMeetingDto {
  // NOT NULL columns: @ValidateIf (not @IsOptional) so an explicit `null` is
  // rejected as 400 rather than silently ignored or reaching the DB.
  @ValidateIf((o) => o.title !== undefined)
  @IsString()
  @MaxLength(200)
  title?: string;

  // Nullable in the DB — null here means "clear it", a valid intent.
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ValidateIf((o) => o.startsAt !== undefined)
  @IsISO8601()
  startsAt?: string;

  @ValidateIf((o) => o.endsAt !== undefined)
  @IsISO8601()
  endsAt?: string;
}
