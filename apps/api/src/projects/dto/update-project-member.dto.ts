import { IsIn } from 'class-validator';
import {
  PROJECT_MEMBER_ROLES,
  type ProjectMemberRoleValue,
} from './add-project-member.dto.js';

export class UpdateProjectMemberDto {
  @IsIn(PROJECT_MEMBER_ROLES)
  role!: ProjectMemberRoleValue;
}
