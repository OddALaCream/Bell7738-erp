import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PROJECT_STATUSES,
  type ProjectStatusValue,
} from './create-project.dto.js';

const VIEWS = [
  'active',
  'completed',
  'paused',
  'endingSoon',
  'overdue',
] as const;
const SORT_FIELDS = [
  'createdAt',
  'startDate',
  'expectedEndDate',
  'name',
] as const;
const ORDERS = ['asc', 'desc'] as const;

export class ListProjectsDto {
  @IsOptional()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(PROJECT_STATUSES)
  status?: ProjectStatusValue;

  @IsOptional()
  @IsIn(VIEWS)
  view?: (typeof VIEWS)[number];

  @IsOptional()
  @IsDateString()
  startFrom?: string;

  @IsOptional()
  @IsDateString()
  startTo?: string;

  @IsOptional()
  @IsDateString()
  endFrom?: string;

  @IsOptional()
  @IsDateString()
  endTo?: string;

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
  sort: (typeof SORT_FIELDS)[number] = 'createdAt';

  @IsOptional()
  @IsIn(ORDERS)
  order: (typeof ORDERS)[number] = 'desc';
}
