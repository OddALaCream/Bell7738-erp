import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const DERIVED_STATUSES = ['pending', 'accepted', 'expired', 'revoked'] as const;

export class ListInvitationsDto {
  @IsOptional()
  @IsIn(DERIVED_STATUSES)
  status?: (typeof DERIVED_STATUSES)[number];

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
