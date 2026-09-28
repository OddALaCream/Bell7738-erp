import { IsInt, IsObject, Min } from 'class-validator';

export class UpdateMeetingNotesDto {
  // Free-form rich content — docs/API.md's example body is `"notes": {}`.
  @IsObject()
  notes!: Record<string, unknown>;

  // docs/API.md optimistic-concurrency convention: the client's last-seen revision.
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}
