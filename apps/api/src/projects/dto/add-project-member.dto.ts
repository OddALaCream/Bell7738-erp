import { IsIn, IsUUID } from 'class-validator';

export const PROJECT_MEMBER_ROLES = ['MANAGER', 'MEMBER', 'VIEWER'] as const;
export type ProjectMemberRoleValue = (typeof PROJECT_MEMBER_ROLES)[number];

export class AddProjectMemberDto {
  @IsUUID()
  userId!: string;

  @IsIn(PROJECT_MEMBER_ROLES)
  role!: ProjectMemberRoleValue;
}
