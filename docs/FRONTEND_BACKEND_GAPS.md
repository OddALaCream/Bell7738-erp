# Frontend ↔ backend gaps

Tracked while implementing `apps/web` against the already-built `apps/api`.
Per `AGENTS.md`, the frontend does not implement backend changes — this file
documents what's missing or divergent so the backend can address it later.

## `GET /api/v1/auth/me` does not return roles/permissions/capabilities

`docs/API.md` and `docs/RBAC.md` both describe `/auth/me` as returning
"identidad actual, permisos efectivos, roles globales y capacidades
generales necesarias para construir UX". The actual implementation
(`apps/api/src/auth/auth.service.ts`, `toUserSummary`) returns only:

```json
{ "id", "email", "firstName", "lastName", "avatarStorageKey", "isOwner", "status" }
```

No effective permission keys and no global role list. There is no other
endpoint that exposes the current actor's own effective permission set —
`GET /roles` returns role summaries (for badges) but not "my roles", and
per-resource `viewerCapabilities` (e.g. `GET /projects/:id`) only cover that
one resource's actions, not global capabilities like `PROJECTS_CREATE`,
`USERS_VIEW`, `ROLES_MANAGE`, `AUDIT_VIEW`, etc.

**Frontend workaround:** navigation/route visibility and top-level "can I
see this admin section" checks are derived heuristically:
- `isOwner` from `/auth/me` unlocks everything in the UI.
- Since a non-owner's global permissions (e.g. `USERS_VIEW`, `ROLES_VIEW`,
  `AUDIT_VIEW`) can't be known client-side without this endpoint, the
  `/admin/*` nav section is shown only to `isOwner` users — the one
  capability we do know — per docs/UI-UX.md ("se muestran según
  capacidades conocidas"). A non-owner granted admin permissions through a
  custom role won't see the nav entry, but the routes and API calls still
  work correctly if they navigate there directly (the backend is still the
  final authority); this is a discoverability gap, not an access gap.
- Per-project and per-resource actions use the real `viewerCapabilities` /
  `capabilities` fields returned by those specific endpoints, which do
  exist and are authoritative for their resource, and correctly hide
  project-scoped actions.
- Create buttons gated on a *global* permission with no resource context
  (e.g. "Crear proyecto" needing `PROJECTS_CREATE`, "Invitar usuario"
  needing `USERS_CREATE`) are shown to every authenticated user for the
  same reason; the backend rejects the POST with `403` if unauthorized and
  the form surfaces that as a normal submit error.

**Suggested backend fix:** extend `AuthService.me()` to also return
`{ globalRoles: RoleSummary[], permissions: string[] }` computed via the
existing `EffectivePermissionsService`, matching the documented contract.

## No endpoint returns which roles a specific user currently has

`UserRole` (the user↔role join table) is queried server-side only by
`EffectivePermissionsService` (to compute permissions) and by the `roleId`
*filter* on `GET /users` (to filter, not to display). No response
anywhere selects or returns it:

- `ADMIN_USER_SELECT` (`apps/api/src/users/users.service.ts`) — used by
  `GET /users`, `GET /users/:userId`, and `PUT /users/:userId/roles`'s
  response — has no `roles`/`userRoles` field.
- `TEAM_USER_SELECT` (same file) — used by `GET /team` and
  `GET /users/:userId/profile` — likewise has none.
- `getOwnProfile`/`getPublicProfile` hardcode `roles: []` via
  `EMPTY_PROFILE_EXTRAS` regardless of the user's actual roles (see the
  profile gap above).

So there is currently no way for the frontend to learn which roles a
specific user has, anywhere in the product.

**Impact:**
- `/team` (docs/UI-UX.md wants "avatar, nombre y badges de roles") can only
  show avatar + name, no role badges.
- The admin Users list/detail can't show per-row role badges, only status.
- The "assign roles" editor (`PUT /users/:userId/roles`, which replaces the
  *complete* role set) has no current selection to prefill — there is no
  way to know what's already assigned before deciding what to replace it
  with.

The same applies to invitations: `CreateInvitationDto.roleIds` is accepted
and applied on accept, but `InvitationsService.toSummary()` never returns
which roles were assigned to a pending invitation, so the invitations list
can't show "will get roles X, Y" either.

**Frontend workaround:** role badges are omitted wherever this data would
be needed, with a short inline note where it's most visibly missing
(profile, team). The "assign roles" dialog opens with every role
unchecked and a prominent warning that it replaces the user's entire role
set — the admin must explicitly re-select every role the user should keep,
not just the ones being added. This is workable but not ideal; the real
fix is a backend change (include `userRoles` in these selects and stop
hardcoding `EMPTY_PROFILE_EXTRAS.roles`).

## `GET /roles` non-privileged response shape

`docs/RBAC.md` says active users "pueden recibir el resumen necesario para
badges" from `GET /roles` while `ROLES_VIEW` unlocks full composition. The
frontend assumes the non-privileged shape is `{ id, name, color, position
}[]` (no `description`/`permissions`) and the privileged shape adds
`description` and `permissions`. This should be confirmed once the backend
team can verify `RolesService.listRoles()`'s exact conditional serialization.

## No endpoint to preview/validate an invitation token before accepting

`docs/UI-UX.md` ("Aceptación de invitación") describes reading the token
from the link and showing the invited person's identity "sólo después de
validar el token", implying a read step separate from submission. The only
endpoint is `POST /api/v1/invitations/accept` (`{ token, password }` →
`204`), which both validates and consumes the token in one step — there is
no `GET` to preview `{ email, firstName, lastName }` for a given token
first.

**Frontend workaround:** `/invitations/accept` renders the password form
directly (no identity preview) and treats any `400`/`410`
`INVITATION_INVALID` from the actual submit as the "expired/used/revoked"
state described in the docs, with the same non-enumerable message. On
success it redirects to `/login` per the documented flow.

## Notifications carry no display text or joined names

`apps/api/src/notifications/notifications.service.ts`'s `NOTIFICATION_SELECT`
returns only `{ id, type, actorId, projectId, taskId, meetingId, payload,
readAt, createdAt }` — bare foreign key UUIDs, not joined actor/task/meeting
names. Every current notification producer (`notifyTaskAssigned`,
`notifyMeetingAdded`, `notifyMeetingUpdated` in the same file, and
presumably the reminder scheduler for `MEETING_REMINDER_24H`/`_1H`) calls
`safeCreate` without ever setting `payload`, so it is always `null` today
despite being a `Json?` column that could carry denormalized display data.

**Frontend workaround:** notification title/body text is a generic,
per-`type` i18n string with no specifics (e.g. "Se te asignó una tarea en
un proyecto" rather than "Se te asignó *Implementar login* en *Proyecto
X*"). Clicking still navigates correctly using `projectId`/`taskId`/
`meetingId`. This is a real UX regression versus docs/UI-UX.md's example
copy ("tipo, texto, tiempo y proyecto cuando aplique" implies specific
text) — recommend the backend populate `payload` with the minimal display
fields (e.g. `{ taskTitle, meetingTitle, projectName }`) at creation time.

## Audit log only covers auth/users/roles actions so far

`apps/api/src/audit/audit-actions.ts`'s `AUDIT_ACTIONS` only has 12 values,
all for invitations/users/roles. `docs/PRODUCT.md` says audit should also
cover "membresías, documentos y revocaciones" (project membership changes,
document deletion, session revocation). The `/admin/audit` page's action
filter dropdown is built from this same fixed list, so it will simply show
fewer filter options than the product doc implies until those modules add
their own audit events — not something the frontend can work around.

## Notes format for Tiptap (meetings)

`docs/ARCHITECTURE.md` says meeting notes are "JSON estructurado". The
frontend assumes this is a Tiptap/ProseMirror JSON document
(`{ type: 'doc', content: [...] }`) matching what Tiptap's `editor.getJSON()`
produces, and sends/receives it verbatim as `notes`. If the backend expects
a different shape (e.g. HTML string) this needs reconciling.
