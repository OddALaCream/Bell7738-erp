import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const USER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED'] as const;
const SORT_FIELDS = ['name', 'email', 'createdAt'] as const;
const ORDERS = ['asc', 'desc'] as const;

export class ListUsersDto {
  @IsOptional()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsEnum(USER_STATUSES)
  status?: (typeof USER_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  roleId?: string;

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
