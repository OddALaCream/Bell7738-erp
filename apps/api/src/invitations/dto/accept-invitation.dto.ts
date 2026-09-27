import { IsString, Length } from 'class-validator';

export class AcceptInvitationDto {
  @IsString()
  @Length(1, 512)
  token!: string;

  // Same bounds as ChangePasswordDto's newPassword — see docs/SECURITY.md.
  @IsString()
  @Length(12, 256)
  password!: string;
}
