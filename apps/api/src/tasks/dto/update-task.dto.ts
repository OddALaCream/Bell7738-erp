import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

// docs/API.md: PATCH only moves between non-terminal statuses — completing
// uses POST .../complete (sets DONE + completedAt) and reopening uses POST
// .../reopen (manager/override scope), both enforcing their own invariants.
export const TASK_NON_TERMINAL_STATUSES = ['PENDING', 'IN_PROGRESS'] as const;
export type TaskNonTerminalStatus = (typeof TASK_NON_TERMINAL_STATUSES)[number];

export class UpdateTaskDto {
  // NOT NULL columns: @ValidateIf (not @IsOptional) so an explicit `null` is
  // rejected as 400 rather than silently ignored or reaching the DB.
  @ValidateIf((o) => o.title !== undefined)
  @IsString()
  @MaxLength(200)
  title?: string;

  // Nullable in the DB — null here means "clear it", a valid intent.
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ValidateIf((o) => o.startDate !== undefined)
  @IsDateString({ strict: true })
  startDate?: string;

  @ValidateIf((o) => o.dueDate !== undefined)
  @IsDateString({ strict: true })
  dueDate?: string;

  @ValidateIf((o) => o.status !== undefined)
  @IsIn(TASK_NON_TERMINAL_STATUSES)
  status?: TaskNonTerminalStatus;
}
