import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const VIEWS = ['upcoming', 'past'] as const;
const SORT_FIELDS = ['startsAt', 'createdAt', 'title'] as const;
const ORDERS = ['asc', 'desc'] as const;

export class ListMeetingsDto {
  @IsOptional()
  @IsIn(VIEWS)
  view?: (typeof VIEWS)[number];

  @IsOptional()
  @IsUUID()
  participantId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

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
  sort: (typeof SORT_FIELDS)[number] = 'startsAt';

  @IsOptional()
  @IsIn(ORDERS)
  order: (typeof ORDERS)[number] = 'asc';
}
