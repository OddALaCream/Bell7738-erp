import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, MaxLength, Min } from 'class-validator';

const SORT_FIELDS = ['createdAt', 'originalName'] as const;
const ORDERS = ['asc', 'desc'] as const;

export class ListDocumentsDto {
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
  sort: (typeof SORT_FIELDS)[number] = 'createdAt';

  @IsOptional()
  @IsIn(ORDERS)
  order: (typeof ORDERS)[number] = 'desc';
}
