import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SetMeetingParticipantsDto {
  // The organizer is force-included by the service even if omitted here —
  // docs/API.md "sin retirar accidentalmente al organizador."
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  participantIds!: string[];
}
