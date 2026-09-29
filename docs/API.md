# API REST

## Alcance

La API de producto es REST JSON y vive bajo `/api/v1`. NestJS genera un documento OpenAPI que forma parte del contrato. Este documento define recursos y comportamiento; los DTO exactos se formalizarán en OpenAPI al implementar.

Los endpoints de healthcheck son operativos y pueden vivir fuera del prefijo versionado.

## Convenciones

- JSON en `camelCase`.
- IDs como UUID strings.
- Instantes como ISO 8601 UTC, por ejemplo `2026-09-27T18:30:00Z`.
- Fechas de calendario como `YYYY-MM-DD` en los read models (`/timeline`, `/calendar`, `/me/schedule`, perfiles). Los recursos `Project` y `Task` serializan sus columnas `@db.Date` como instante `YYYY-MM-DDT00:00:00.000Z`; los clientes deben leer sólo los primeros 10 caracteres como día de calendario y nunca convertirlos con la zona horaria del usuario.
- Content type normal: `application/json`.
- Uploads: `multipart/form-data` con streaming.
- Autenticación: `Authorization: Bearer <accessToken>`.
- Refresh web: cookie `HttpOnly`; no se devuelve el refresh token en JSON en V1.
- Todos los endpoints autentican salvo login, aceptación de invitación y healthchecks expresamente públicos.

## Formato de respuesta

Recurso único:

```json
{
  "data": {
    "id": "uuid"
  }
}
```

Colección:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 0,
    "totalPages": 0
  }
}
```

Operaciones sin cuerpo pueden responder `204 No Content`.

## Errores

Formato estable:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "details": [
      {
        "field": "email",
        "code": "INVALID_EMAIL",
        "message": "Enter a valid email address."
      }
    ],
    "requestId": "uuid"
  }
}
```

`message` y `details` nunca incluyen stack traces, queries, secretos ni existencia de cuentas cuando eso facilite enumeración.

Códigos base:

- `VALIDATION_ERROR` → `400`.
- `AUTHENTICATION_REQUIRED` → `401`.
- `INVALID_CREDENTIALS` → `401` con mensaje genérico.
- `SESSION_INVALID` → `401`.
- `FORBIDDEN` → `403`.
- `NOT_FOUND` → `404`.
- `CONFLICT` → `409`.
- `REVISION_CONFLICT` → `409`.
- `INVITATION_INVALID` → `400` o `410` con mensaje no enumerable.
- `PAYLOAD_TOO_LARGE` → `413`.
- `UNSUPPORTED_FILE_TYPE` → `415`.
- `RATE_LIMITED` → `429`.
- `INTERNAL_ERROR` → `500` con mensaje público genérico.

Un recurso fuera del scope del usuario normalmente responde `404`, aunque exista.

## Paginación, filtros y orden

- `page`: inicia en `1`.
- `pageSize`: default `25`, máximo `100`.
- `search`: texto con longitud limitada.
- `sort`: sólo campos incluidos en una allowlist por endpoint.
- `order`: `asc` o `desc`.
- Filtros repetibles o CSV se normalizan en DTO; OpenAPI define una única forma.

V1 usa paginación por página porque el volumen interno es pequeño. Las respuestas tienen un orden secundario estable por `id` para evitar resultados ambiguos.

## Concurrencia

Las notas de reunión usan concurrencia optimista. El cliente envía:

```json
{
  "notes": {},
  "expectedRevision": 4
}
```

Si la revisión actual ya no es `4`, la API devuelve `409 REVISION_CONFLICT` con la revisión actual y `updatedAt`, sin sobrescribir. Otros recursos pueden adoptar la misma convención si aparecen conflictos reales; no se añade versionado indiscriminadamente.

## Autenticación

### `POST /api/v1/auth/login`

Público. Body: `email`, `password`. Si las credenciales y estado son válidos:

- crea `Session`;
- establece cookie refresh;
- devuelve `accessToken`, `expiresIn` y el usuario actual con el mismo contenido que `GET /auth/me`;
- actualiza `lastLoginAt`;
- usa `Cache-Control: no-store`.

La respuesta de fallo no distingue usuario inexistente, password inválido o estado bloqueado.

### `POST /api/v1/auth/refresh`

Público con cookie refresh y validación de Origin. Rota refresh y devuelve nuevo access token. `Cache-Control: no-store`. No acepta un `userId` del cliente.

### `POST /api/v1/auth/logout`

Revoca la sesión de la cookie/token actual, limpia cookie y responde de forma idempotente.

### `POST /api/v1/auth/logout-all`

Autenticado. Revoca todas las sesiones del actor y limpia cookie. La respuesta no deja activa la sesión que ejecuta la operación.

### `GET /api/v1/auth/sessions`

Lista únicamente sesiones propias con `id`, user-agent resumido, IP cuando exista, creación, última actividad, expiración, revocación e indicador de sesión actual.

### `DELETE /api/v1/auth/sessions/{sessionId}`

Revoca una sesión propia. Cambiar el UUID por el de otra persona responde `404`.

### `GET /api/v1/auth/me`

Devuelve la identidad actual y lo necesario para construir la UX. No reemplaza autorización backend.

```json
{
  "data": {
    "id": "uuid",
    "email": "ana@example.com",
    "firstName": "Ana",
    "lastName": "Ruiz",
    "avatarStorageKey": null,
    "isOwner": false,
    "status": "ACTIVE",
    "roles": [{ "id": "uuid", "name": "Developer", "color": "#0ea5e9", "position": 2 }],
    "permissions": ["DASHBOARD_VIEW", "TASKS_CREATE"],
    "capabilities": { "uploads": { "maxBytes": 26214400, "allowedExtensions": ["pdf", "png"] } }
  }
}
```

- `permissions` es la unión de los permisos de los roles del usuario, en orden alfabético. El Owner recibe el catálogo completo porque su bypass es implícito.
- `roles` son resúmenes de presentación; nunca incluyen la composición de permisos.
- `capabilities.uploads` refleja `MAX_UPLOAD_BYTES` y `DOCUMENT_ALLOWED_EXTENSIONS` para que el cliente muestre los límites antes de enviar; el servidor sigue validando cada archivo.
- Es una instantánea: se vuelve a calcular en cada llamada y puede quedar obsoleta. Cada petición se autoriza otra vez con datos actuales de PostgreSQL.

### `POST /api/v1/auth/change-password`

Autenticado. Body: `currentPassword`, `newPassword`. Reemplaza el hash, revoca las demás sesiones y rota las credenciales de la sesión actual. Se usa también para cambiar la contraseña inicial del Owner; no existe un endpoint administrativo para establecer passwords ajenos.

## Invitaciones

### `POST /api/v1/invitations`

Requiere `USERS_CREATE`. Body: `email`, `firstName`, `lastName`, `roleIds`.

Crea usuario `INVITED`, invitación y roles iniciales de forma transaccional. Si SMTP no está configurado, la respuesta incluye `manualLink` una única vez y usa `Cache-Control: no-store`. Nunca devuelve el hash. El enlace es `{WEB_ORIGIN}/accept-invitation#token=…`: el token viaja en el fragmento para que no llegue a logs de acceso y el frontend lo envía en el cuerpo de `POST /invitations/accept`.

### `GET /api/v1/invitations`

Requiere `USERS_VIEW`. Lista invitaciones con filtros por estado derivado: pendiente, aceptada, expirada o revocada.

### `POST /api/v1/invitations/{invitationId}/resend`

Requiere `USERS_CREATE`. Revoca el token anterior, genera uno nuevo y opcionalmente entrega email o `manualLink`.

### `POST /api/v1/invitations/{invitationId}/revoke`

Requiere `USERS_CREATE`. Idempotente para una invitación ya revocada; no cambia un usuario ya activo.

### `POST /api/v1/invitations/accept`

Público. Body: `token`, `password`. Consume token, establece password, asigna roles y activa usuario. No inicia sesión automáticamente si eso complica la separación de controles; la V1 puede redirigir a login después del éxito.

## Usuarios y perfiles

### `GET /api/v1/users`

Requiere `USERS_VIEW`. Filtros: `search`, `status`, `roleId`, paginación y orden por nombre, email o creación. Cada usuario incluye `roles` (resúmenes `{ id, name, color, position }`).

### `POST /api/v1/users`

Alias administrativo opcional para crear/invitar; si existe, debe ejecutar el mismo caso de uso que `POST /invitations`, no crear un segundo flujo.

### `GET /api/v1/users/{userId}`

Requiere `USERS_VIEW`. Devuelve datos administrativos, `roles` y estado; nunca `passwordHash` ni tokens. Las respuestas de `PATCH`, suspender, reactivar, deshabilitar y `PUT .../roles` usan la misma forma.

### `PATCH /api/v1/users/{userId}`

Requiere `USERS_UPDATE`. Permite nombre, apellido y email. Cambiar email normaliza, comprueba unicidad, revoca sesiones y genera auditoría. Estado y roles usan endpoints específicos.

### `POST /api/v1/users/{userId}/suspend`

Requiere `USERS_DISABLE`. Cambia a `SUSPENDED` y revoca sesiones en una transacción.

### `POST /api/v1/users/{userId}/reactivate`

Requiere `USERS_UPDATE`. Cambia `SUSPENDED` a `ACTIVE`; no restaura sesiones.

### `POST /api/v1/users/{userId}/disable`

Requiere `USERS_DISABLE`. Cambia a `DISABLED` y revoca sesiones. No aplica al Owner.

### `PUT /api/v1/users/{userId}/roles`

Requiere `USERS_ROLES_MANAGE`. Body: conjunto completo `roleIds`. La API valida anti-escalamiento antes de reemplazar relaciones en transacción.

### `GET /api/v1/me/profile`

Devuelve el perfil propio (datos administrativos propios), `roles` y las listas `activeProjects`, `pastProjects`, `activeTasks` y `completedTasks`, restringidas a los proyectos que el propio usuario puede ver (mismo scope que `GET /projects`).

- Proyecto: `{ id, name, status, role, startDate, expectedEndDate }`; `role` es el rol local de la persona. Son *activos* los `PLANNED`/`ACTIVE`/`PAUSED` con membresía vigente; el resto (cerrados o con membresía retirada) son *anteriores*.
- Tarea: `{ id, projectId, projectName, title, startDate, dueDate, status, completedAt }`; sólo tareas asignadas a la persona. Las terminadas se ordenan por `completedAt` descendente.
- Las listas están acotadas (200 membresías, 50 tareas activas, 20 terminadas) y no incluyen proyectos ni tareas dados de baja. Se resuelven con tres consultas, sin lecturas por proyecto.

### `PATCH /api/v1/me/profile`

Permite editar datos propios no privilegiados, inicialmente `firstName` y `lastName`. Email, estado y roles no entran en este DTO.

### `PUT /api/v1/me/avatar` y `DELETE /api/v1/me/avatar`

Upload de imagen opcional con los mismos controles de tamaño, contenido y storage seguro que documentos. La API devuelve una URL propia; no acepta URLs externas arbitrarias. Puede diferirse si V1 usa iniciales como fallback, sin bloquear el resto del perfil.

### `GET /api/v1/users/{userId}/profile`

Perfil interno visible a usuarios activos: `id`, `email`, nombre, avatar, `roles` y las mismas listas que `/me/profile`, calculadas para esa persona **pero filtradas por el scope de quien consulta**. Un observador sin acceso a un proyecto no recibe ni su nombre ni sus tareas. Un usuario no `ACTIVE` responde `404`. No incluye estado, `isOwner`, fechas administrativas ni proyectos ajenos.

### `GET /api/v1/team`

Directorio interno de usuarios activos con avatar, nombre y `roles` (resúmenes para badges, sin permisos). Soporta búsqueda y paginación. No devuelve usuarios invitados o deshabilitados a usuarios normales.

## Roles y permisos

### `GET /api/v1/permissions`

Requiere `ROLES_VIEW` o `ROLES_MANAGE`. Lista el catálogo fijo con key y descripción.

### `GET /api/v1/roles`

Usuarios activos pueden recibir el resumen necesario para badges. Consultar composición completa requiere `ROLES_VIEW`.

### `POST /api/v1/roles`

Requiere `ROLES_MANAGE`. Body: `name`, `description`, `color`, `position`, `permissionIds`.

### `GET /api/v1/roles/{roleId}`

Requiere `ROLES_VIEW`.

### `PATCH /api/v1/roles/{roleId}`

Requiere `ROLES_MANAGE`. Puede editar presentación y conjunto de permisos, aplicando las restricciones anti-escalamiento.

### `DELETE /api/v1/roles/{roleId}`

Requiere `ROLES_MANAGE`. Rechaza roles asignados hasta resolver sus usuarios de forma explícita. No existe endpoint para crear permisos arbitrarios.

## Proyectos

### `GET /api/v1/projects`

Aplica scope RBAC en la consulta. Filtros:

- `search` por nombre o cliente;
- `status`;
- `view=active|completed|paused|endingSoon|overdue`;
- `startFrom`, `startTo`, `endFrom`, `endTo`;
- `sort=createdAt|startDate|expectedEndDate|name`;
- `order` y paginación.

`endingSoon` usa una ventana configurable inicial de 7 días. `overdue` excluye `COMPLETED` y `CANCELLED`.

### `POST /api/v1/projects`

Requiere `PROJECTS_CREATE` y capacidad de vista asignada o global. Crea el proyecto y su manager inicial en una transacción.

### `GET /api/v1/projects/{projectId}`

Devuelve overview y capacidades del actor en ese proyecto.

### `PATCH /api/v1/projects/{projectId}`

Requiere `PROJECTS_UPDATE` y scope definido en RBAC. Mantiene coherencia de estado y `completedAt`.

### `DELETE /api/v1/projects/{projectId}`

Requiere `PROJECTS_DELETE`. Realiza baja lógica, no cascade físico.

## Miembros de proyecto

### `GET /api/v1/projects/{projectId}/members`

Requiere visibilidad del proyecto. Incluye usuario, rol local y fechas relevantes.

### `POST /api/v1/projects/{projectId}/members`

Requiere `PROJECT_MEMBERS_MANAGE`. Body: `userId`, `role`. Sólo usuarios `ACTIVE`.

### `PATCH /api/v1/projects/{projectId}/members/{userId}`

Requiere `PROJECT_MEMBERS_MANAGE`. Cambia rol local y protege al último manager.

### `DELETE /api/v1/projects/{projectId}/members/{userId}`

Requiere `PROJECT_MEMBERS_MANAGE`. Marca membresía retirada; no borra historia. La respuesta puede advertir asignaciones o reuniones vigentes que deben reasignarse.

## Tareas

### `GET /api/v1/projects/{projectId}/tasks`

Filtros: `status`, `assigneeId`, `from`, `to`, `includeCompleted`, búsqueda, paginación y orden. Scope por proyecto.

### `POST /api/v1/projects/{projectId}/tasks`

Requiere `TASKS_CREATE`. Body: `title`, `description`, `startDate`, `dueDate`, `assigneeIds`. Requiere al menos un asignado válido.

### `GET /api/v1/projects/{projectId}/tasks/{taskId}`

Verifica que la tarea pertenezca al proyecto de la URL y que el actor vea el proyecto.

### `PATCH /api/v1/projects/{projectId}/tasks/{taskId}`

Requiere `TASKS_UPDATE` y relación permitida. Edita contenido, fechas, estado no terminal y asignados. Cambiar a `DONE` usa la regla `TASKS_COMPLETE`; reabrir requiere `TASKS_UPDATE` con scope de manager/override.

### `POST /api/v1/projects/{projectId}/tasks/{taskId}/complete`

Requiere `TASKS_COMPLETE`. Operación idempotente que establece `DONE` y `completedAt`.

### `POST /api/v1/projects/{projectId}/tasks/{taskId}/reopen`

Requiere `TASKS_UPDATE` con scope suficiente. Establece `IN_PROGRESS` por defecto y limpia `completedAt`.

### `PUT /api/v1/projects/{projectId}/tasks/{taskId}/assignees`

Requiere `TASKS_UPDATE`. Reemplaza el conjunto completo sin permitir cero asignados.

### `DELETE /api/v1/projects/{projectId}/tasks/{taskId}`

Requiere `TASKS_DELETE`. Baja lógica.

## Cronograma y calendarios

### `GET /api/v1/projects/{projectId}/timeline`

Read model de tareas con rango, asignados y estado. No crea una entidad timeline.

### `GET /api/v1/projects/{projectId}/calendar`

Query requerida: `from`, `to`; rango máximo definido para evitar consultas excesivas. Devuelve una unión discriminada:

```json
{
  "kind": "task",
  "id": "uuid",
  "projectId": "uuid",
  "title": "Implement login",
  "start": "2026-09-28",
  "end": "2026-10-02",
  "status": "IN_PROGRESS"
}
```

o:

```json
{
  "kind": "meeting",
  "id": "uuid",
  "projectId": "uuid",
  "title": "Planning",
  "start": "2026-09-28T14:00:00Z",
  "end": "2026-09-28T15:00:00Z"
}
```

### `GET /api/v1/me/schedule`

Combina sólo tareas asignadas y reuniones donde el actor participa. Filtros: `kind=all|task|meeting`, `projectId`, `from`, `to`, `status`, `view=list|calendar`. Es un read model, no duplica recursos.

## Reuniones y notas

### `GET /api/v1/projects/{projectId}/meetings`

Filtros por rango, participante, próximos/pasados, búsqueda y paginación.

### `POST /api/v1/projects/{projectId}/meetings`

Requiere `MEETINGS_CREATE`. Body: `title`, `description`, `startsAt`, `endsAt`, `participantIds`. El organizador es el actor y se incluye como participante.

### `GET /api/v1/projects/{projectId}/meetings/{meetingId}`

Incluye participantes, notas, `revision` y capacidades del actor.

### `PATCH /api/v1/projects/{projectId}/meetings/{meetingId}`

Requiere `MEETINGS_UPDATE` y scope. Edita título, agenda y horario. Un cambio significativo crea notificaciones y recalcula recordatorios.

### `PUT /api/v1/projects/{projectId}/meetings/{meetingId}/participants`

Requiere `MEETINGS_UPDATE` y ser organizador, manager u override. Reemplaza participantes válidos sin retirar accidentalmente al organizador.

### `PATCH /api/v1/projects/{projectId}/meetings/{meetingId}/notes`

Requiere `MEETINGS_UPDATE` y ser participante, manager u override. Body: `notes`, `expectedRevision`. Devuelve la revisión incrementada o `409 REVISION_CONFLICT`.

### `DELETE /api/v1/projects/{projectId}/meetings/{meetingId}`

Requiere `MEETINGS_DELETE`. Baja lógica, cancela recordatorios pendientes y notifica a participantes cuando corresponda.

## Documentos

### `GET /api/v1/projects/{projectId}/documents`

Lista metadata con búsqueda, paginación y orden. Requiere visibilidad del proyecto. Cada documento incluye `uploadedBy: { id, firstName, lastName }` (sólo nombre, también si la persona ya no es miembro).

### `POST /api/v1/projects/{projectId}/documents`

Requiere `DOCUMENTS_UPLOAD`. Multipart con un archivo. El backend hace streaming, valida límites, calcula metadata y sólo confirma la fila cuando storage y transacción quedan coherentes.

### `GET /api/v1/projects/{projectId}/documents/{documentId}`

Devuelve metadata, no la ruta física.

### `GET /api/v1/projects/{projectId}/documents/{documentId}/download`

Reautoriza y transmite el archivo con headers seguros. Nunca redirige a una ruta local ni acepta `storageKey` del cliente.

### `DELETE /api/v1/projects/{projectId}/documents/{documentId}`

Requiere `DOCUMENTS_DELETE` y scope. Operación idempotente con baja lógica y eliminación del objeto reintentable.

## Notificaciones

### `GET /api/v1/notifications`

Sólo notificaciones propias. Filtros: `read`, `type`, paginación y orden descendente.

### `GET /api/v1/notifications/unread-count`

Devuelve `{ "data": { "count": 0 } }`.

### `POST /api/v1/notifications/{notificationId}/read`

Marca una notificación propia como leída de forma idempotente.

### `POST /api/v1/notifications/read-all`

Marca todas las notificaciones propias como leídas.

No hay endpoints para crear notificaciones arbitrarias desde el cliente.

## Actividad y auditoría

### `GET /api/v1/projects/{projectId}/activity`

Requiere visibilidad del proyecto. Filtros por tipo, actor, fecha y paginación descendente. Cada evento incluye `actor: { id, firstName, lastName } | null` y `project: { id, name }`.

### `GET /api/v1/activity`

Feed entre proyectos para el dashboard: los mismos eventos y filtros (`type`, `actorId`, `from`, `to`, `page`, `pageSize` ≤ 100), limitados en la consulta a los proyectos que el actor puede ver y excluyendo proyectos dados de baja. Un usuario sin visibilidad de proyectos recibe una lista vacía.

### `GET /api/v1/audit`

Requiere `AUDIT_VIEW`. Filtros por actor, acción, entidad, fecha y paginación. La respuesta ya está redactada y no incluye secretos.

### `GET /api/v1/audit/{auditId}`

Requiere `AUDIT_VIEW`. No existen endpoints de update/delete.

## Dashboard

### Dashboard: sin endpoint dedicado

V1 **no** define `GET /dashboard`. La pantalla inicial compone cinco lecturas acotadas sobre endpoints que ya aplican su scope en la consulta, cada una como bloque independiente (un fallo sólo afecta a su bloque):

- tareas pendientes o en progreso: `GET /me/schedule?kind=task&status=…`;
- próximas reuniones: `GET /me/schedule?kind=meeting&from=…&to=…`;
- proyectos activos: `GET /projects?view=active`;
- actividad reciente: `GET /activity?pageSize=8`;
- equipo: `GET /team?pageSize=8`.

Un endpoint agregado sólo se justificaría si estas lecturas resultaran lentas o si "mis proyectos" tuviera que significar exclusivamente membresías. `DASHBOARD_VIEW` decide si la UI muestra el dashboard como página de inicio; no protege datos porque cada lectura tiene su propia autorización.

## Healthchecks

### `GET /health/live`

Confirma que el proceso responde. No consulta dependencias pesadas y no revela configuración.

### `GET /health/ready`

Comprueba al menos conexión a PostgreSQL y disponibilidad básica del storage persistente. SMTP opcional no bloquea readiness.

## OpenAPI y Swagger

- Cada controlador y DTO mantiene status codes, autenticación, errores y ejemplos mínimos.
- El documento JSON debe poder generarse de forma determinista durante verificación.
- Swagger UI puede habilitarse en desarrollo.
- En producción se deshabilita o restringe; el contrato no requiere una UI pública.
- Un futuro SDK web o móvil puede generarse desde OpenAPI, pero no se añade hasta que aporte valor.

## Compatibilidad y cambios

- Cambios aditivos permanecen en `v1` cuando no rompen clientes.
- Renombrar/eliminar campos, cambiar significado o endurecer un campo opcional requiere transición compatible o una nueva versión.
- Campos desconocidos de entrada se rechazan; clientes deben tolerar campos nuevos de salida.
- No se crea `/api/v2` por anticipado.
