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

const KINDS = ['all', 'task', 'meeting'] as const;
const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE'] as const;
const VIEWS = ['list', 'calendar'] as const;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * docs/API.md "Mi cronograma": "Combina sólo tareas asignadas y reuniones
 * donde el actor participa." `view` only affects how the frontend presents
 * the same items — it has no effect on which rows this endpoint returns.
 */
export class MyScheduleQueryDto {
  @IsOptional()
  @IsIn(KINDS)
  kind: (typeof KINDS)[number] = 'all';

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @Matches(DATE_ONLY)
  @IsDateString()
  from?: string;

  @IsOptional()
  @Matches(DATE_ONLY)
  @IsDateString()
  to?: string;

  // Meetings have no status column; this filters the task side only.
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: (typeof TASK_STATUSES)[number];

  @IsOptional()
  @IsIn(VIEWS)
  view: (typeof VIEWS)[number] = 'list';

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
