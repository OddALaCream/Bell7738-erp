import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// `Boolean('false') === true`, so a plain `@Type(() => Boolean)` would treat
// every non-empty query string as true. Map the two accepted spellings
// explicitly and let @IsBoolean() reject anything else.
function toBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

const TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE'] as const;
const SORT_FIELDS = ['createdAt', 'dueDate', 'startDate', 'title'] as const;
const ORDERS = ['asc', 'desc'] as const;

export class ListTasksDto {
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: (typeof TASK_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  // Ignored when `status` is explicitly provided. Defaults to false: the
  // list hides DONE tasks unless the caller opts in.
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeCompleted = false;

  @IsOptional()
  @MaxLength(200)
  search?: string;

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

  @IsOptional()
  @IsIn(SORT_FIELDS)
  sort: (typeof SORT_FIELDS)[number] = 'dueDate';

  @IsOptional()
  @IsIn(ORDERS)
  order: (typeof ORDERS)[number] = 'asc';
}
