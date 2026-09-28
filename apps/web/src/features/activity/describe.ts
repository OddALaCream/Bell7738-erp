import type { ActivityEvent } from '@/types/domain';

/** Resolves a user id to a display name; `null` means the event has no actor. */
export type NameOf = (userId: string | null) => string;

const FIELD_LABEL: Record<string, string> = {
  name: 'nombre',
  title: 'título',
  description: 'descripción',
  status: 'estado',
  clientName: 'cliente',
  startDate: 'inicio',
  expectedEndDate: 'fin esperado',
  dueDate: 'vencimiento',
  startsAt: 'inicio',
  endsAt: 'fin',
};

const ROLE_LABEL: Record<string, string> = { MANAGER: 'Manager', MEMBER: 'Miembro', VIEWER: 'Viewer' };

function text(metadata: ActivityEvent['metadata'], key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

/** "(título, vencimiento)" for the edited fields we can name; empty when none are recognizable. */
function editedFields(metadata: ActivityEvent['metadata']): string {
  const fields = metadata?.fields;
  if (!Array.isArray(fields)) return '';
  const labels = [...new Set(fields.map((field) => FIELD_LABEL[String(field)]).filter(Boolean))];
  return labels.length > 0 ? ` (${labels.join(', ')})` : '';
}

/**
 * The API returns only a type and a little metadata (no message, no actor
 * name), so the sentence is composed here. Returns the predicate without the
 * actor: "creó la tarea «X»".
 */
export function describeActivity(event: ActivityEvent, nameOf: NameOf): string {
  const { metadata } = event;
  switch (event.type) {
    case 'PROJECT_CREATED': {
      const name = text(metadata, 'name');
      return name ? `creó el proyecto «${name}»` : 'creó el proyecto';
    }
    case 'PROJECT_UPDATED':
      return `actualizó el proyecto${editedFields(metadata)}`;
    case 'PROJECT_DELETED':
      return 'eliminó el proyecto';
    case 'PROJECT_MEMBER_ADDED': {
      const role = ROLE_LABEL[text(metadata, 'role') ?? ''];
      return `añadió a ${nameOf(event.entityId)} al proyecto${role ? ` como ${role}` : ''}`;
    }
    case 'PROJECT_MEMBER_ROLE_CHANGED': {
      const role = ROLE_LABEL[text(metadata, 'role') ?? ''];
      return `cambió el rol de ${nameOf(event.entityId)}${role ? ` a ${role}` : ''}`;
    }
    case 'PROJECT_MEMBER_REMOVED':
      return `retiró a ${nameOf(event.entityId)} del proyecto`;
    case 'TASK_CREATED': {
      const title = text(metadata, 'title');
      return title ? `creó la tarea «${title}»` : 'creó una tarea';
    }
    case 'TASK_UPDATED':
      return `editó una tarea${editedFields(metadata)}`;
    case 'TASK_COMPLETED':
      return 'completó una tarea';
    case 'TASK_REOPENED':
      return 'reabrió una tarea';
    case 'TASK_DELETED':
      return 'eliminó una tarea';
    case 'TASK_ASSIGNEES_CHANGED':
      return 'cambió los asignados de una tarea';
    case 'MEETING_CREATED':
      return 'creó una reunión';
    case 'MEETING_UPDATED':
      return `editó una reunión${editedFields(metadata)}`;
    case 'MEETING_PARTICIPANTS_CHANGED':
      return 'cambió los participantes de una reunión';
    case 'MEETING_NOTES_UPDATED':
      return 'actualizó las notas de una reunión';
    case 'MEETING_DELETED':
      return 'eliminó una reunión';
    case 'DOCUMENT_UPLOADED': {
      const name = text(metadata, 'originalName');
      return name ? `subió el documento «${name}»` : 'subió un documento';
    }
    case 'DOCUMENT_DELETED':
      return 'eliminó un documento';
    default:
      return 'realizó un cambio';
  }
}

/**
 * Where the event's subject lives now. Deleted subjects have no destination,
 * so the feed shows them as plain history instead of a dead link.
 */
export function activityHref(event: ActivityEvent): string | null {
  const base = `/projects/${event.projectId}`;
  switch (event.type) {
    case 'PROJECT_CREATED':
    case 'PROJECT_UPDATED':
      return `${base}/overview`;
    case 'PROJECT_MEMBER_ADDED':
    case 'PROJECT_MEMBER_ROLE_CHANGED':
    case 'PROJECT_MEMBER_REMOVED':
      return `${base}/members`;
    case 'TASK_CREATED':
    case 'TASK_UPDATED':
    case 'TASK_COMPLETED':
    case 'TASK_REOPENED':
    case 'TASK_ASSIGNEES_CHANGED':
      return event.entityId ? `${base}/tasks?taskId=${event.entityId}` : `${base}/tasks`;
    case 'MEETING_CREATED':
    case 'MEETING_UPDATED':
    case 'MEETING_PARTICIPANTS_CHANGED':
    case 'MEETING_NOTES_UPDATED':
      return event.entityId ? `${base}/meetings?meetingId=${event.entityId}` : `${base}/meetings`;
    case 'DOCUMENT_UPLOADED':
      return `${base}/documents`;
    default:
      return null;
  }
}

/** Options for the activity type filter, grouped by what the user thinks in (not the raw enum). */
export const ACTIVITY_TYPE_GROUPS: Array<{ label: string; types: ActivityEvent['type'][] }> = [
  {
    label: 'Proyecto y miembros',
    types: [
      'PROJECT_CREATED',
      'PROJECT_UPDATED',
      'PROJECT_DELETED',
      'PROJECT_MEMBER_ADDED',
      'PROJECT_MEMBER_ROLE_CHANGED',
      'PROJECT_MEMBER_REMOVED',
    ],
  },
  {
    label: 'Tareas',
    types: ['TASK_CREATED', 'TASK_UPDATED', 'TASK_COMPLETED', 'TASK_REOPENED', 'TASK_DELETED', 'TASK_ASSIGNEES_CHANGED'],
  },
  {
    label: 'Reuniones',
    types: ['MEETING_CREATED', 'MEETING_UPDATED', 'MEETING_PARTICIPANTS_CHANGED', 'MEETING_NOTES_UPDATED', 'MEETING_DELETED'],
  },
  { label: 'Documentos', types: ['DOCUMENT_UPLOADED', 'DOCUMENT_DELETED'] },
];

export const ACTIVITY_TYPE_LABEL: Record<ActivityEvent['type'], string> = {
  PROJECT_CREATED: 'Proyecto creado',
  PROJECT_UPDATED: 'Proyecto actualizado',
  PROJECT_DELETED: 'Proyecto eliminado',
  PROJECT_MEMBER_ADDED: 'Miembro añadido',
  PROJECT_MEMBER_ROLE_CHANGED: 'Rol de miembro cambiado',
  PROJECT_MEMBER_REMOVED: 'Miembro retirado',
  TASK_CREATED: 'Tarea creada',
  TASK_UPDATED: 'Tarea editada',
  TASK_COMPLETED: 'Tarea completada',
  TASK_REOPENED: 'Tarea reabierta',
  TASK_DELETED: 'Tarea eliminada',
  TASK_ASSIGNEES_CHANGED: 'Asignados cambiados',
  MEETING_CREATED: 'Reunión creada',
  MEETING_UPDATED: 'Reunión editada',
  MEETING_PARTICIPANTS_CHANGED: 'Participantes cambiados',
  MEETING_NOTES_UPDATED: 'Notas actualizadas',
  MEETING_DELETED: 'Reunión eliminada',
  DOCUMENT_UPLOADED: 'Documento subido',
  DOCUMENT_DELETED: 'Documento eliminado',
};
