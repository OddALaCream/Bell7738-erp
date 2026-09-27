import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class AssignRolesDto {
  // The complete new role set for the user (replaces, doesn't diff).
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  roleIds: string[] = [];
}
