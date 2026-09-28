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

## Notes format for Tiptap (meetings)

`docs/ARCHITECTURE.md` says meeting notes are "JSON estructurado". The
frontend assumes this is a Tiptap/ProseMirror JSON document
(`{ type: 'doc', content: [...] }`) matching what Tiptap's `editor.getJSON()`
produces, and sends/receives it verbatim as `notes`. If the backend expects
a different shape (e.g. HTML string) this needs reconciling.
