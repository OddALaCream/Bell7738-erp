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
  id: string;
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

/**
 * Matches ADMIN_USER_SELECT in apps/api/src/users/users.service.ts — no
 * `roles` field is returned here (see docs/FRONTEND_BACKEND_GAPS.md).
 */
export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  isOwner: boolean;
  avatarStorageKey: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

/** Matches TEAM_USER_SELECT — GET /team and GET /users/:userId/profile. No roles. */
export interface TeamUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarStorageKey: string | null;
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

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

/** No `roles` field is returned — see docs/FRONTEND_BACKEND_GAPS.md. */
export interface Invitation {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  invitedById: string;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
}

export interface InvitationWithManualLink extends Invitation {
  manualLink: string;
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
  clientName: string | null;
  status: ProjectStatus;
  startDate: string | null;
  expectedEndDate: string | null;
  completedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail extends ProjectSummary {
  viewerCapabilities: ProjectViewerCapabilities;
}

export interface ProjectMember {
  userId: string;
  role: ProjectRole;
  joinedAt: string;
  updatedAt: string;
  user: Pick<UserSummary, 'id' | 'firstName' | 'lastName' | 'email' | 'avatarStorageKey'>;
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
  | 'MEETING_REMINDER_1H';

/**
 * Matches NOTIFICATION_SELECT in apps/api/src/notifications/notifications.service.ts:
 * only bare foreign key ids, no joined names, and `payload` is never
 * populated by any current notification producer — see
 * docs/FRONTEND_BACKEND_GAPS.md. Display text is derived client-side from
 * `type` alone; links are built from the raw ids.
 */
export interface Notification {
  id: string;
  type: NotificationType;
  actorId: string | null;
  projectId: string | null;
  taskId: string | null;
  meetingId: string | null;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
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
