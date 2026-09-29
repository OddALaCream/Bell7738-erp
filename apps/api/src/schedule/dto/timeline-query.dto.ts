import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  Matches,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE'] as const;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** docs/API.md "Cronograma": read model de tareas con rango, asignados y estado. */
export class TimelineQueryDto {
  @IsOptional()
  @Matches(DATE_ONLY)
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @Matches(DATE_ONLY)
  @IsDateString({ strict: true })
  to?: string;

  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: (typeof TASK_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}
