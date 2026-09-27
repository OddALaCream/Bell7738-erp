import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  PROJECT_STATUSES,
  type ProjectStatusValue,
} from './create-project.dto.js';

export class UpdateProjectDto {
  // NOT NULL columns: @ValidateIf (not @IsOptional) so an explicit `null` is
  // rejected as 400 rather than silently ignored or reaching the DB.
  @ValidateIf((o) => o.name !== undefined)
  @IsString()
  @MaxLength(200)
  name?: string;

  // Nullable in the DB — null here means "clear it", a valid intent.
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientName?: string | null;

  @ValidateIf((o) => o.status !== undefined)
  @IsIn(PROJECT_STATUSES)
  status?: ProjectStatusValue;

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  expectedEndDate?: string | null;
}
