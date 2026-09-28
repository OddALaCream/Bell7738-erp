/**
 * docs/DATABASE.md: "Los tipos de actividad ... pueden ser strings
 * controlados por código para evitar una migración por cada nuevo evento,
 * pero no aceptan valores arbitrarios del cliente." This is the single
 * source of truth for every value ever written to ActivityEvent.type.
 */
export const ACTIVITY_EVENT_TYPES = [
  'PROJECT_CREATED',
  'PROJECT_UPDATED',
  'PROJECT_DELETED',
  'PROJECT_MEMBER_ADDED',
  'PROJECT_MEMBER_ROLE_CHANGED',
  'PROJECT_MEMBER_REMOVED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_COMPLETED',
  'TASK_REOPENED',
  'TASK_DELETED',
  'TASK_ASSIGNEES_CHANGED',
  'MEETING_CREATED',
  'MEETING_UPDATED',
  'MEETING_PARTICIPANTS_CHANGED',
  'MEETING_NOTES_UPDATED',
  'MEETING_DELETED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_DELETED',
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];
