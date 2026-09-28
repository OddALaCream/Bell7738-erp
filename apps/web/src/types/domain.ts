import type { ProjectRole, ProjectStatus, TaskStatus } from '@startup-erp/shared';

export type { ProjectRole, ProjectStatus, TaskStatus };

export const UserStatus = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DISABLED: 'DISABLED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/** GET /auth/me — see docs/FRONTEND_BACKEND_GAPS.md: no roles/permissions here yet. */
export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarStorageKey: string | null;
  isOwner: boolean;
  status: UserStatus;
}

export interface Permission {
  key: string;
  description: string;
}

export interface RoleSummary {
  id: string;
  name: string;
  color: string;
  position: number;
}

export interface Role extends RoleSummary {
  description: string;
  permissions: Permission[];
}

export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  isOwner: boolean;
  avatarStorageKey: string | null;
  roles: RoleSummary[];
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Session {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  revokedAt: string | null;
  isCurrent: boolean;
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

export interface Invitation {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: InvitationStatus;
  roles: RoleSummary[];
  createdAt: string;
  expiresAt: string;
}

export interface ProjectViewerCapabilities {
  role: ProjectRole | null;
  canUpdate: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  client: string | null;
  status: ProjectStatus;
  startDate: string | null;
  expectedEndDate: string | null;
  completedAt: string | null;
  createdAt: string;
  memberCount?: number;
}

export interface ProjectDetail extends ProjectSummary {
  viewerCapabilities: ProjectViewerCapabilities;
}

export interface ProjectMember {
  userId: string;
  projectId: string;
  role: ProjectRole;
  user: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email' | 'avatarStorageKey'>;
  addedAt: string;
  removedAt: string | null;
}

export interface TaskAssignee {
  id: string;
  firstName: string;
  lastName: string;
  avatarStorageKey: string | null;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  startDate: string;
  dueDate: string;
  status: TaskStatus;
  creatorId: string;
  assignees: TaskAssignee[];
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingParticipant {
  id: string;
  firstName: string;
  lastName: string;
  avatarStorageKey: string | null;
}

export interface MeetingCapabilities {
  canEditMeeting: boolean;
  canEditNotes: boolean;
  canDelete: boolean;
  canManageParticipants: boolean;
}

export interface MeetingSummary {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  organizerId: string;
  participants: MeetingParticipant[];
}

export interface MeetingDetail extends MeetingSummary {
  notes: Record<string, unknown> | null;
  revision: number;
  updatedAt: string;
  capabilities: MeetingCapabilities;
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  fileName: string;
  contentType: string;
  size: number;
  uploaderId: string;
  uploader?: Pick<UserSummary, 'firstName' | 'lastName'>;
  createdAt: string;
}

export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'MEETING_ADDED'
  | 'MEETING_UPDATED'
  | 'MEETING_REMINDER_24H'
  | 'MEETING_REMINDER_1H'
  | string;

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
  resource?: {
    kind: 'project' | 'task' | 'meeting' | 'document';
    projectId?: string;
    id?: string;
  } | null;
}

export interface ActivityEvent {
  id: string;
  projectId: string;
  type: string;
  actorId: string | null;
  actor?: Pick<UserSummary, 'firstName' | 'lastName'>;
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export type CalendarItem =
  | {
      kind: 'task';
      id: string;
      projectId: string;
      title: string;
      start: string;
      end: string;
      status: TaskStatus;
    }
  | {
      kind: 'meeting';
      id: string;
      projectId: string;
      title: string;
      start: string;
      end: string;
    };

export interface DashboardData {
  tasks: Task[];
  upcomingMeetings: MeetingSummary[];
  activeProjects: ProjectSummary[];
  recentActivity: ActivityEvent[];
  team: AdminUser[];
}
