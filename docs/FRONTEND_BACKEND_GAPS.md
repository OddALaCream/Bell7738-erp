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

## Calendar-date fields serialize as full ISO instants, not `YYYY-MM-DD`

`docs/API.md` says calendar dates (`startDate`, `expectedEndDate`, task
`dueDate`, etc.) use bare `YYYY-MM-DD`. The Prisma columns are `@db.Date`,
but Nest's default JSON serialization calls `Date.prototype.toJSON()`,
which always produces a full `2026-09-28T00:00:00.000Z` instant regardless
of the underlying SQL type. (The schedule read models — `/timeline`,
`/calendar`, `/me/schedule` — do format tasks as bare `YYYY-MM-DD`; project
and task resources do not.) **Frontend workaround:** every calendar-date
value goes through `apps/web/src/lib/dates.ts`, which keeps only the first 10
characters and builds a *local* date from them. `new Date(value)` must not be
used for display: in a UTC-negative zone the `T00:00:00Z` instant renders as
the previous day (covered by `lib/dates.test.ts`, pinned to UTC−5).

## Notes format for Tiptap (meetings) — confirmed, no action needed

`UpdateMeetingNotesDto.notes` is validated only with `@IsObject()` and stored
as `Json`, so the frontend sends and reads Tiptap's `editor.getJSON()`
(`{ type: 'doc', content: [...] }`) verbatim. Notes are `null` until the
first save; `revision` starts at `1` (`expectedRevision` is `@Min(1)`).

## `REVISION_CONFLICT` says *when*, not *who*

`docs/UI-UX.md` asks the conflict UI to say "quién/cuándo modificó si la API
dispone de esa información". The `409` body carries `currentRevision` and
`updatedAt` (the notes' `notesUpdatedAt`) but not the author, although the
row stores `notesUpdatedById`. The conflict panel therefore shows the
revision number and time only. **Suggested backend fix (optional):** include
the last editor's `{ id, firstName, lastName }` in the conflict body.

## Upload limits are server config and not exposed

`docs/UI-UX.md` wants size/type limits "visibles antes de enviar". The limits
(`MAX_UPLOAD_BYTES`, `DOCUMENT_ALLOWED_EXTENSIONS`) are backend env vars read by
`AppConfigService`; no endpoint returns them. **Frontend workaround:**
`VITE_MAX_UPLOAD_BYTES` and `VITE_DOCUMENT_ALLOWED_EXTENSIONS` (defaults equal
to the backend's `.env.example`; see `apps/web/.env.example`) feed the drop
zone hint and an early per-file check. If the two drift, the only cost is a
file rejected by the server (its `413`/`415` is shown per file) or one blocked
early. **Suggested backend fix:** expose them, e.g. in `GET /auth/me` or a small
`GET /config` (`{ maxUploadBytes, allowedExtensions }`).

## Documents have no uploader name

`DOCUMENT_SELECT` returns `uploadedById` only. `docs/UI-UX.md` lists
"uploader" in the documents list. **Frontend workaround:** the name is
resolved from the project's members; an uploader who is no longer a member
shows as "un usuario que ya no es miembro". **Suggested backend fix:** include
`uploadedBy: { id, firstName, lastName }` in the document summary.

## Web Push has no backend endpoints

`docs/PRODUCT.md` and `docs/UI-UX.md` treat Web Push as an optional,
progressive enhancement. The API only defines VAPID env variables
(`env.schema.ts`); there is no endpoint to register or remove a push
subscription and no delivery code. The frontend therefore ships no push
opt-in UI (nothing to prompt for, no permission banners), and the in-app bell
plus `/notifications` are the only channel, as the docs require to always work.
Once the backend exposes `POST/DELETE /notifications/push-subscription`, the
opt-in belongs in `/profile` and the service worker's `push` handler.
