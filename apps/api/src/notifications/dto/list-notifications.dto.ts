import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const NOTIFICATION_TYPES = [
  'TASK_ASSIGNED',
  'MEETING_ADDED',
  'MEETING_UPDATED',
  'MEETING_REMINDER_24H',
  'MEETING_REMINDER_1H',
] as const;

// `Boolean('false') === true`, so map the two accepted spellings explicitly.
function toBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class ListNotificationsDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  read?: boolean;

  @IsOptional()
  @IsIn(NOTIFICATION_TYPES)
  type?: (typeof NOTIFICATION_TYPES)[number];

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
