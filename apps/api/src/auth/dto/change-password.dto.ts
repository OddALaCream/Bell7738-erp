import { IsString, Length } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @Length(1, 1024)
  currentPassword!: string;

  // docs/SECURITY.md: minimum 12 chars, generous max to allow passphrases
  // without inviting resource-abuse from pathological input.
  @IsString()
  @Length(12, 256)
  newPassword!: string;
}
