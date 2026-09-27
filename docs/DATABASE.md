# Base de datos

## Alcance

PostgreSQL es la fuente de verdad de la V1. Prisma definirá el modelo y las migraciones, pero las reglas que no pueda representar deben implementarse mediante SQL de migración y validaciones backend explícitas.

Este documento describe el modelo objetivo. Los nombres exactos de columnas pueden adaptarse a las convenciones de Prisma siempre que se mantengan las invariantes.

## Convenciones

- Claves primarias de negocio: UUID generados por el servidor.
- Instantes: `timestamptz`, almacenados en UTC y serializados como ISO 8601.
- Fechas sin hora: PostgreSQL `date` para fechas de proyectos y tareas.
- Timestamps estándar: `createdAt` y `updatedAt` donde la entidad sea mutable.
- Email: trim y lowercase antes de persistir, con unicidad sobre el valor normalizado.
- Texto visible: límites de longitud aplicados en DTO y, para campos críticos, también en base de datos.
- JSONB sólo para contenido realmente estructurado o metadata variable; no para evitar relaciones normales.
- Relaciones históricas usan `ON DELETE RESTRICT` o `SET NULL`; no se borran en cascada usuarios ni entidades auditadas.
- Todos los listados excluyen registros con `deletedAt` salvo una operación administrativa explícita.

## Enums

### `UserStatus`

- `INVITED`: invitado sin credenciales activas.
- `ACTIVE`: puede autenticarse y operar según permisos.
- `SUSPENDED`: bloqueo reversible; todas sus sesiones se revocan.
- `DISABLED`: baja lógica; no puede recuperar acceso sin una reactivación administrativa explícita.

### `ProjectStatus`

- `PLANNED`
- `ACTIVE`
- `PAUSED`
- `COMPLETED`
- `CANCELLED`

### `ProjectMemberRole`

- `MANAGER`
- `MEMBER`
- `VIEWER`

### `TaskStatus`

- `PENDING`
- `IN_PROGRESS`
- `DONE`

### `NotificationType`

- `TASK_ASSIGNED`
- `MEETING_ADDED`
- `MEETING_UPDATED`
- `MEETING_REMINDER_24H`
- `MEETING_REMINDER_1H`

Los tipos de actividad y auditoría pueden ser strings controlados por código para evitar una migración por cada nuevo evento, pero no aceptan valores arbitrarios del cliente.

## Identidad y acceso

### `User`

Campos:

- `id UUID` PK.
- `email String` único, normalizado.
- `passwordHash String?`; nulo mientras el usuario esté únicamente invitado.
- `firstName String`.
- `lastName String`.
- `avatarStorageKey String?`; la API deriva una URL propia autorizada.
- `status UserStatus`.
- `isOwner Boolean`, por defecto `false`.
- `createdAt timestamptz`.
- `updatedAt timestamptz`.
- `lastLoginAt timestamptz?`.

Invariantes:

- Sólo puede existir un usuario con `isOwner = true`. Se usa un índice único parcial creado en la migración.
- El Owner siempre debe permanecer `ACTIVE`.
- `ACTIVE` requiere `passwordHash`.
- Email no cambia a un valor ya utilizado; un cambio administrativo revoca sesiones y se audita.
- No existe delete físico desde la API. La baja normal usa `DISABLED`.
- Cambiar a `SUSPENDED` o `DISABLED` revoca todas las sesiones en la misma transacción.

Índices:

- unique sobre email normalizado;
- `(status, createdAt)` para administración;
- búsqueda por nombre puede comenzar con índices normales y `ILIKE`; no añadir búsqueda full-text hasta necesitarla.

### `Session`

Campos:

- `id UUID` PK; se incluye como `sid` en los JWT.
- `userId UUID` FK a `User`.
- `refreshTokenHash String` único.
- `userAgent String?`, con longitud limitada.
- `ip String?`.
- `createdAt timestamptz`.
- `lastActivityAt timestamptz`.
- `expiresAt timestamptz`.
- `revokedAt timestamptz?`.

Invariantes:

- Nunca se persiste el refresh token completo.
- Una sesión es válida sólo si no está revocada, no expiró y el usuario sigue `ACTIVE`.
- Refresh rota el token y reemplaza su hash de forma atómica.
- Logout marca `revokedAt`; no necesita borrar la fila.
- La metadata de IP y user-agent es informativa, no una credencial.

Índices:

- `(userId, revokedAt, expiresAt)` para validar y listar sesiones;
- unique sobre `refreshTokenHash`;
- `expiresAt` para limpieza periódica posterior.

### `Invitation`

Campos:

- `id UUID` PK.
- `userId UUID` FK único al usuario `INVITED`.
- `tokenHash String` único.
- `invitedById UUID` FK a `User`.
- `expiresAt timestamptz`.
- `acceptedAt timestamptz?`.
- `revokedAt timestamptz?`.
- `createdAt timestamptz`.

La invitación toma email y nombre desde `User`; no duplica esos valores. Un reenvío revoca el token vigente y crea uno nuevo. Un token es utilizable sólo una vez, antes de expirar y mientras el usuario continúe `INVITED`.

### `InvitationRole`

Relación con PK compuesta `(invitationId, roleId)`. Guarda los roles iniciales hasta aceptar. La aceptación asigna los roles y consume la invitación en una transacción.

### `Role`

Campos:

- `id UUID` PK.
- `name String` único de forma case-insensitive.
- `description String?`.
- `color String`, color hexadecimal validado.
- `position Int`, usado sólo para orden visual.
- `createdAt timestamptz`.
- `updatedAt timestamptz`.

No existe un rol Owner. `position` no concede jerarquía ni permisos implícitos.

### `Permission`

Campos:

- `id UUID` PK.
- `key String` único.
- `description String`.

El catálogo se mantiene por código y seed idempotente. La UI permite asignar permisos conocidos a roles, no inventar claves sin comportamiento backend.

### `UserRole`

PK compuesta `(userId, roleId)`. Incluye:

- `assignedById UUID?`, nulo para seed del sistema;
- `createdAt timestamptz`.

Los permisos efectivos de un usuario son la unión de sus roles. No se duplican permisos directamente en `User`.

### `RolePermission`

PK compuesta `(roleId, permissionId)`, con `createdAt`. Cambiar estas relaciones requiere las protecciones de [RBAC.md](./RBAC.md) y un evento de auditoría.

## Proyectos y trabajo

### `Project`

Campos:

- `id UUID` PK.
- `name String`.
- `description String?`.
- `clientName String?`.
- `status ProjectStatus`.
- `startDate date?`.
- `expectedEndDate date?`.
- `completedAt timestamptz?`.
- `createdById UUID` FK a `User`.
- `createdAt timestamptz`.
- `updatedAt timestamptz`.
- `deletedAt timestamptz?`.
- `deletedById UUID?` FK a `User`.

Invariantes:

- Si ambas fechas existen, `expectedEndDate >= startDate`.
- `COMPLETED` requiere `completedAt`; salir de `COMPLETED` limpia `completedAt`.
- La operación delete de API es baja lógica y conserva historial.
- Al crear, el creador se añade como `MANAGER` en la misma transacción, salvo que opere como Owner y el caso de uso decida añadir otro manager inicial.

Índices:

- `(status, expectedEndDate)` para filtros;
- `createdAt` para orden;
- `lower(name)` si la búsqueda por nombre lo requiere;
- índice parcial de registros no eliminados cuando el volumen lo justifique.

### `ProjectMember`

PK compuesta `(projectId, userId)`. Campos:

- `role ProjectMemberRole`.
- `addedById UUID` FK a `User`.
- `joinedAt timestamptz`.
- `updatedAt timestamptz`.
- `removedAt timestamptz?`.

Una membresía con `removedAt` deja de conceder acceso pero se conserva para historial. Reincorporar al usuario reactiva la misma fila y establece el nuevo rol. Los asignados y participantes históricos no se borran al retirar membresía.

Índices:

- `(userId, removedAt)` para Mis proyectos;
- `(projectId, role, removedAt)` para gestión de miembros.

### `Task`

Campos:

- `id UUID` PK.
- `projectId UUID` FK a `Project`.
- `title String`.
- `description String?`.
- `startDate date`.
- `dueDate date`.
- `status TaskStatus`.
- `createdById UUID` FK a `User`.
- `completedAt timestamptz?`.
- `createdAt timestamptz`.
- `updatedAt timestamptz`.
- `deletedAt timestamptz?`.
- `deletedById UUID?`.

Invariantes:

- `dueDate >= startDate`.
- `DONE` requiere `completedAt`; otros estados requieren `completedAt = null`.
- Toda tarea activa tiene al menos un asignado. Esta cardinalidad mínima se valida en servicio y transacción.
- El creador y los asignados deben tener acceso activo al proyecto al crear o asignar.

Índices:

- `(projectId, status, dueDate)`;
- `(projectId, startDate, dueDate)` para calendario y cronograma;
- `createdAt` para actividad y orden estable.

### `TaskAssignee`

PK compuesta `(taskId, userId)`. Incluye `assignedById` y `assignedAt`. Índice `(userId, taskId)` para Mi cronograma, dashboard y perfil.

La relación se conserva mientras exista la tarea, aunque el usuario salga después del proyecto. Las nuevas asignaciones sólo aceptan miembros activos.

## Reuniones y notas

### `Meeting`

Campos:

- `id UUID` PK.
- `projectId UUID` FK a `Project`.
- `title String`.
- `description String?` para agenda o contexto.
- `startsAt timestamptz`.
- `endsAt timestamptz`.
- `organizerId UUID` FK a `User`.
- `notes Json?` con documento Tiptap validado.
- `revision Int`, inicial `1`.
- `notesUpdatedAt timestamptz?`.
- `notesUpdatedById UUID?` FK a `User`.
- `createdAt timestamptz`.
- `updatedAt timestamptz`.
- `deletedAt timestamptz?`.
- `deletedById UUID?`.

Invariantes:

- `endsAt > startsAt`.
- El organizador debe ser miembro activo del proyecto al crear la reunión y también participante.
- Toda actualización de notas compara la revisión esperada e incrementa `revision` atómicamente.
- Cambiar horario o participantes genera notificaciones según corresponda y recalcula recordatorios.

Índices:

- `(projectId, startsAt)`;
- `(organizerId, startsAt)`;
- `(projectId, deletedAt, startsAt)`.

### `MeetingParticipant`

PK compuesta `(meetingId, userId)`. Incluye `addedById` y `addedAt`. Índice `(userId, meetingId)` para Mi cronograma. Sólo se agregan usuarios activos con membresía vigente en el proyecto.

### `MeetingReminder`

Campos:

- `id UUID` PK.
- `meetingId UUID` FK a `Meeting`.
- `offsetMinutes Int`, inicialmente `1440` y `60`.
- `scheduledFor timestamptz`.
- `deliveredAt timestamptz?`.
- `createdAt timestamptz`.
- `updatedAt timestamptz`.

Constraints e índices:

- unique `(meetingId, offsetMinutes)`;
- índice `(deliveredAt, scheduledFor)` para encontrar pendientes.

Al mover o cancelar una reunión se recalculan o eliminan lógicamente los pendientes. Si un offset ya quedó en el pasado al crear la reunión, no se envía retroactivamente; se mantienen sólo recordatorios futuros.

## Documentos

### `Document`

Campos:

- `id UUID` PK.
- `projectId UUID` FK a `Project`.
- `originalName String`, sanitizado para presentación.
- `storageKey String` único, generado por servidor y sin segmentos del nombre original.
- `mimeType String`, determinado o validado por servidor.
- `size BigInt`.
- `checksumSha256 String?`.
- `uploadedById UUID` FK a `User`.
- `createdAt timestamptz`.
- `deletedAt timestamptz?`.
- `deletedById UUID?`.

PostgreSQL no almacena el binario. Índices `(projectId, createdAt)` y `(uploadedById, createdAt)`. La eliminación retira el archivo del storage de forma idempotente y conserva metadata mínima y auditoría; los fallos parciales deben poder reintentarse.

## Notificaciones

### `Notification`

Campos:

- `id UUID` PK.
- `userId UUID` FK al destinatario.
- `type NotificationType`.
- `actorId UUID?` FK al usuario que originó el evento.
- `projectId UUID?` FK.
- `taskId UUID?` FK.
- `meetingId UUID?` FK.
- `payload Json?` limitado a metadata de presentación no sensible.
- `dedupeKey String?` único.
- `readAt timestamptz?`.
- `createdAt timestamptz`.

El backend valida qué referencia requiere cada tipo. `dedupeKey` evita duplicar recordatorios y otros eventos reintentables. Borrar el recurso puede usar `SET NULL`; la notificación histórica permanece con un texto seguro.

Índices:

- `(userId, readAt, createdAt)` para campana y contador;
- `(userId, createdAt)` para historial;
- unique parcial sobre `dedupeKey` no nulo.

## Actividad y auditoría

### `ActivityEvent`

Campos:

- `id UUID` PK.
- `projectId UUID` FK.
- `actorId UUID?` FK; nulo para sistema.
- `type String` controlado por backend.
- `entityType String`.
- `entityId UUID?`.
- `metadata Json?` con valores mínimos para representación.
- `createdAt timestamptz`.

Índice `(projectId, createdAt DESC)`. Es append-only desde los casos de uso; no hay endpoints de edición o borrado.

### `AuditLog`

Campos:

- `id UUID` PK.
- `actorId UUID?` FK; nulo para eventos anónimos o del sistema.
- `action String` controlado por backend.
- `entityType String?`.
- `entityId UUID?`.
- `requestId String?`.
- `ip String?`.
- `userAgent String?`.
- `metadata Json?` redactada.
- `createdAt timestamptz`.

Índices:

- `createdAt DESC`;
- `(actorId, createdAt DESC)`;
- `(entityType, entityId, createdAt DESC)`.

No se guardan secretos, hashes de contraseña, tokens, cookies, contenido completo de documentos ni notas completas. La aplicación no expone update/delete para auditoría.

## Relaciones y reglas de borrado

- `User`: nunca se borra físicamente desde producto.
- `Role`: no se borra mientras esté asignado; la UI debe confirmar y retirar relaciones de forma explícita si corresponde.
- `Permission`: catálogo administrado por código; no se elimina desde UI.
- `Project`, `Task`, `Meeting` y `Document`: delete de producto es baja lógica.
- Tablas de unión pueden retirarse o marcarse según la necesidad histórica descrita.
- `ActivityEvent` y `AuditLog`: append-only.
- Ningún cascade debe eliminar accidentalmente actividad, auditoría o referencias a usuarios.

## Integridad y concurrencia

Constraints de base de datos:

- unicidad de email, claves de permisos, nombres de roles normalizados, storage keys y hashes/tokens vigentes;
- checks de rangos de fechas y horas;
- coherencia entre estados `DONE`/`COMPLETED` y `completedAt`;
- `revision > 0`;
- `size >= 0` y `offsetMinutes > 0`;
- un único Owner mediante índice parcial.

Reglas que requieren transacción de servicio:

- al menos un asignado por tarea;
- usuarios asignados o participantes con membresía activa;
- protección del último manager cuando el proyecto quedaría sin administración, salvo Owner;
- asignación de roles sin escalamiento;
- cambios de estado de usuario junto con revocación de sesiones;
- notificación y marca de entrega de recordatorio.

## Seeds

El seed debe ser idempotente y crear:

- catálogo de permisos definido en [RBAC.md](./RBAC.md);
- roles iniciales sólo si se deciden explícitamente, sin usarlos como sustituto de permisos en código;
- Organization Owner desde variables de entorno cuando aún no exista.

El seed nunca imprime la contraseña del Owner ni sobrescribe credenciales o roles existentes en ejecuciones posteriores.

## Migraciones

- En desarrollo, crear una migración por cambio coherente y revisar el SQL generado.
- Probar la migración contra una base con datos representativos.
- Versionar `schema.prisma` y todo el historial de migraciones.
- En despliegue, ejecutar `prisma migrate deploy` antes de iniciar la nueva versión.
- No usar `prisma db push` como sustituto en staging o producción.
- Para cambios destructivos, aplicar expansión y contracción: añadir estructura compatible, rellenar datos, desplegar código lector/escritor y retirar lo antiguo en otra release.
- El rollback normal de datos es restaurar backup o aplicar una migración correctiva revisada; no improvisar un down destructivo.

## Retención y mantenimiento

- Sesiones e invitaciones expiradas pueden purgarse después de un periodo operativo definido, conservando auditoría.
- Notificaciones antiguas pueden tener una política de retención futura; V1 no las borra automáticamente sin decisión de producto.
- Actividad y auditoría se conservan durante V1; cualquier política posterior requiere requisitos legales y de almacenamiento.
- Ejecutar backups consistentes de PostgreSQL junto con el volumen de documentos y probar restauraciones.
