import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MaxLength(200)
  firstName!: string;

  @IsString()
  @MaxLength(200)
  lastName!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  roleIds: string[] = [];
}
