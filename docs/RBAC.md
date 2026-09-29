# RBAC

## Objetivo

La autorización de V1 combina permisos globales configurables con pertenencia y rol dentro de cada proyecto. El backend es la autoridad final. El frontend puede ocultar acciones para mejorar UX, pero toda petición se autoriza nuevamente con datos actuales de PostgreSQL.

No existe multi-tenancy: todas las personas pertenecen a una única organización.

## Conceptos

### Owner

`User.isOwner` representa al único Organization Owner. No es un rol configurable y no aparece en `RolePermission`.

El Owner:

- tiene acceso completo;
- puede administrar usuarios, roles, permisos, proyectos y auditoría;
- no puede ser eliminado, suspendido ni deshabilitado;
- no puede perder `isOwner` mediante la API normal;
- sólo se crea mediante el bootstrap/seed controlado.

El bypass del Owner se implementa en una política central y se audita. No debe repartirse como condicionales inconsistentes por controladores.

### Permiso global

Una clave de capacidad conocida por el backend, por ejemplo `TASKS_CREATE`. Los permisos se asignan a roles y no directamente a usuarios.

### Rol global

Agrupación configurable de permisos. Un usuario puede tener varios roles y sus permisos efectivos son la unión de todos ellos. Nombre, color y posición son presentación; no crean una jerarquía implícita.

### Membresía de proyecto

`ProjectMember` determina si el usuario pertenece al proyecto y su rol local `MANAGER`, `MEMBER` o `VIEWER`. Una membresía retirada deja de conceder acceso aunque sus registros históricos permanezcan.

### Relación con el recurso

Algunas acciones requieren además que el usuario sea creador, asignado, organizador, participante o uploader. Esta relación limita la acción; nunca reemplaza el permiso global ni la visibilidad del proyecto.

## Catálogo inicial de permisos

### General

- `DASHBOARD_VIEW`: mostrar el dashboard como página de inicio. Es una preferencia de presentación: el dashboard se compone de lecturas que ya aplican su propio scope, así que este permiso no protege datos adicionales.

### Proyectos

- `PROJECTS_VIEW_ASSIGNED`: ver proyectos con membresía activa.
- `PROJECTS_VIEW_ALL`: ver todos los proyectos de la organización.
- `PROJECTS_CREATE`: crear proyectos.
- `PROJECTS_UPDATE`: editar datos y estado de proyectos autorizados.
- `PROJECTS_DELETE`: dar de baja lógica proyectos autorizados.
- `PROJECT_MEMBERS_MANAGE`: añadir, cambiar rol o retirar miembros donde el alcance lo permita.

### Tareas

- `TASKS_CREATE`: crear tareas en proyectos autorizados.
- `TASKS_UPDATE`: editar contenido, fechas, asignados o reabrir tareas autorizadas.
- `TASKS_DELETE`: dar de baja lógica tareas autorizadas.
- `TASKS_COMPLETE`: marcar tareas como terminadas.

### Reuniones

- `MEETINGS_CREATE`: crear reuniones.
- `MEETINGS_UPDATE`: editar reuniones, participantes o notas dentro del alcance permitido.
- `MEETINGS_DELETE`: dar de baja lógica reuniones.

### Documentos

- `DOCUMENTS_UPLOAD`: subir documentos.
- `DOCUMENTS_DELETE`: eliminar documentos según alcance.

Listar y descargar documentos no requieren una clave adicional en V1: derivan del acceso de lectura al proyecto. Esto evita permisos innecesariamente granulares.

### Usuarios y roles

- `USERS_VIEW`: listar y consultar perfiles administrativos.
- `USERS_CREATE`: crear invitaciones y reenviarlas o revocarlas.
- `USERS_UPDATE`: editar datos, suspender, reactivar o deshabilitar dentro de las protecciones administrativas.
- `USERS_DISABLE`: suspender o deshabilitar usuarios. Se mantiene separado de edición general por su impacto.
- `USERS_ROLES_MANAGE`: asignar o retirar roles permitidos.
- `ROLES_VIEW`: listar roles y sus permisos.
- `ROLES_MANAGE`: crear, editar y eliminar roles configurables y cambiar sus permisos.
- `AUDIT_VIEW`: consultar auditoría administrativa.

El catálogo se puede ampliar cuando aparezca una necesidad de negocio verificable. No se crean permisos por cada botón, campo o endpoint si la misma capacidad y alcance ya expresan la regla.

## Algoritmo de autorización

Para una petición autenticada, el backend evalúa en orden:

1. El JWT es válido, es de tipo access y referencia una sesión vigente.
2. El usuario existe y está `ACTIVE`.
3. Si es Owner, permite la acción salvo una invariante que también protege al Owner.
4. El usuario posee el permiso global requerido.
5. Para un recurso de proyecto, el usuario puede ver ese proyecto.
6. Su rol local u override organizacional permite el tipo de operación.
7. Si aplica, mantiene la relación requerida con el recurso.
8. Se validan invariantes de negocio, como fechas o protección del último manager.

Cada consulta de recurso incluye el `projectId` esperado o lo obtiene desde la relación persistida. Nunca se autoriza usando únicamente un ID enviado por cliente.

## Visibilidad de proyecto

Un usuario puede ver un proyecto cuando se cumple una de estas condiciones:

- es Owner;
- tiene `PROJECTS_VIEW_ALL`; o
- tiene `PROJECTS_VIEW_ASSIGNED` y una membresía activa en ese proyecto.

`PROJECTS_VIEW_ALL` amplía alcance de lectura, pero no concede acciones de escritura. Para modificar un proyecto ajeno se necesita además el permiso específico.

Si el usuario sólo tiene `PROJECTS_VIEW_ASSIGNED`, una membresía `removedAt` o inexistente niega acceso aun si conserva asignaciones históricas.

## Rol local de proyecto

### `VIEWER`

- Puede leer overview, tareas, cronograma, calendario, reuniones, documentos, miembros y actividad si tiene visibilidad.
- No puede crear, editar ni eliminar recursos de proyecto.
- Ser participante de una reunión no convierte por sí solo al Viewer en editor de notas.

### `MEMBER`

- Incluye lectura.
- Puede crear tareas, reuniones y documentos si posee el permiso global correspondiente.
- Puede editar una tarea creada por él o asignada a él según la acción específica.
- Puede completar una tarea si está asignado y posee `TASKS_COMPLETE`.
- Puede editar estructura de una reunión si es organizador y posee `MEETINGS_UPDATE`.
- Puede editar notas si es participante y posee `MEETINGS_UPDATE`.
- No puede administrar membresías ni eliminar recursos ajenos sólo por ser Member.

### `MANAGER`

- Incluye capacidades locales de Member.
- Con los permisos globales correspondientes, puede editar, completar o eliminar cualquier tarea del proyecto.
- Con los permisos correspondientes, puede editar o eliminar cualquier reunión y administrar participantes.
- Con `DOCUMENTS_DELETE`, puede eliminar cualquier documento del proyecto.
- Con `PROJECT_MEMBERS_MANAGE`, puede administrar miembros del proyecto.
- No puede modificar usuarios globales, roles globales ni auditoría sin los permisos administrativos respectivos.

## Override organizacional

Un usuario con `PROJECTS_VIEW_ALL` y el permiso de escritura específico puede operar en cualquier proyecto sin ser miembro, como administrador organizacional. Por ejemplo:

- `PROJECTS_VIEW_ALL` + `PROJECTS_UPDATE` permite editar cualquier proyecto.
- `PROJECTS_VIEW_ALL` + `TASKS_DELETE` permite eliminar lógicamente cualquier tarea.
- `PROJECTS_VIEW_ALL` + `PROJECT_MEMBERS_MANAGE` permite administrar miembros.

El permiso de acción sigue siendo obligatorio. `PROJECTS_VIEW_ALL` solo nunca permite mutar.

## Reglas por recurso

### Proyectos

- Crear: `PROJECTS_CREATE` y `PROJECTS_VIEW_ASSIGNED` o `PROJECTS_VIEW_ALL`. El creador se añade como `MANAGER`.
- Editar: `PROJECTS_UPDATE` y ser `MANAGER`, o tener override organizacional.
- Eliminar lógicamente: `PROJECTS_DELETE` y ser `MANAGER`, o tener override.
- Gestionar miembros: `PROJECT_MEMBERS_MANAGE` y ser `MANAGER`, o tener override.

Un manager no puede retirar al último manager activo si con ello el proyecto queda sin responsable, salvo que el Owner resuelva explícitamente el reemplazo. Nadie puede añadirse a sí mismo a un proyecto usando un ID arbitrario sin permiso de gestión.

### Tareas

- Crear: `TASKS_CREATE` y rol `MEMBER` o `MANAGER`, o override.
- Editar contenido/fechas/asignados: `TASKS_UPDATE` y ser creador, `MANAGER` u override. Un asignado que no sea creador sólo cambia estado mediante las reglas de completar.
- Completar: `TASKS_COMPLETE` y ser asignado, `MANAGER` u override.
- Reabrir: `TASKS_UPDATE` y ser `MANAGER` u override.
- Eliminar: `TASKS_DELETE` y ser `MANAGER` u override.

Los nuevos asignados deben ser usuarios activos y miembros vigentes del mismo proyecto.

### Reuniones y notas

- Crear: `MEETINGS_CREATE` y rol `MEMBER` o `MANAGER`, o override.
- Editar horario, agenda o participantes: `MEETINGS_UPDATE` y ser organizador, `MANAGER` u override.
- Editar notas: `MEETINGS_UPDATE` y ser participante, `MANAGER` u override.
- Eliminar: `MEETINGS_DELETE` y ser organizador, `MANAGER` u override.

Los nuevos participantes deben ser usuarios activos y miembros vigentes del proyecto. Editar notas siempre respeta `revision`; autorización no permite ignorar un conflicto.

### Documentos

- Listar/descargar: cualquier usuario con visibilidad del proyecto.
- Subir: `DOCUMENTS_UPLOAD` y rol `MEMBER` o `MANAGER`, o override.
- Eliminar: `DOCUMENTS_DELETE` y ser uploader, `MANAGER` u override.

Toda descarga vuelve a comprobar acceso; conocer `storageKey` o URL no concede autorización.

### Actividad

Se puede leer con visibilidad del proyecto. No existe permiso de edición porque es append-only.

## Administración global segura

### Usuarios

- Consultar: `USERS_VIEW`.
- Invitar: `USERS_CREATE`.
- Editar datos no sensibles: `USERS_UPDATE`.
- Suspender o deshabilitar: `USERS_DISABLE`.
- Asignar roles: `USERS_ROLES_MANAGE`.

Un no-Owner:

- no puede modificar su propio estado ni sus propios roles;
- no puede afectar al Owner;
- no puede asignar un rol que contenga permisos fuera de su propio conjunto efectivo;
- no puede usar la edición de perfil para cambiar `isOwner`, estado o roles sin el endpoint y permiso específicos.

La reactivación requiere `USERS_UPDATE` y se audita. Reactivar no restaura sesiones revocadas.

### Roles

`ROLES_VIEW` permite consultar. `ROLES_MANAGE` permite crear o modificar roles, pero un no-Owner sólo puede incluir permisos que ya posee. No puede cambiar un rol de manera que se auto-conceda una capacidad nueva indirectamente.

Antes de aplicar un cambio, el backend calcula los permisos efectivos del actor usando el estado anterior y valida el nuevo conjunto completo. Todos los cambios de roles y permisos generan auditoría.

Los roles asignados no se eliminan silenciosamente. La operación debe rechazar o exigir una reasignación explícita y auditable.

### Auditoría

Sólo Owner o `AUDIT_VIEW`. Este permiso no revela secretos; los datos ya deben estar redactados al escribir el evento.

## Capacidades propias implícitas

Un usuario activo puede, sin permisos administrativos:

- consultar su identidad y perfil básico;
- listar y revocar sus propias sesiones;
- cerrar su sesión o todas sus sesiones;
- consultar y marcar sus propias notificaciones;
- ver sus tareas, reuniones y proyectos únicamente cuando las reglas de proyecto lo permitan.

Estas capacidades no permiten consultar recursos equivalentes de otra persona cambiando un ID.

## Respuestas y prevención de IDOR

- Un recurso de proyecto que el actor no puede conocer normalmente responde `404`, evitando confirmar su existencia.
- Un recurso conocido dentro de un contexto accesible, pero cuya acción falta, puede responder `403`.
- Un usuario no autenticado recibe `401`.
- IDs de `userId`, `projectId`, `taskId`, `meetingId`, `documentId` y `sessionId` siempre se cruzan con actor y alcance.
- Listados aplican el scope en la consulta; no recuperan todo para filtrar en memoria.

## Frontend

`GET /auth/me` (y la respuesta de login) devuelve los roles y los permisos efectivos del actor (el Owner, el catálogo completo); los recursos de proyecto devuelven además el rol local y sus capacidades. La UI los usa para navegación, rutas de administración y botones, y vuelve a pedirlos al recuperar el foco de la pestaña. Esa información es una instantánea de UX y puede quedar obsoleta. El frontend debe manejar denegaciones backend sin revelar datos, mantener botones deshabilitados u ocultos de forma coherente y no interpretar colores o posiciones como permisos.

## Pruebas obligatorias futuras

Cada política debe cubrir al menos:

- Owner permitido y protegido contra operaciones inválidas.
- Usuario sin permiso denegado.
- Usuario suspendido o sesión revocada denegados.
- `VIEWER`, `MEMBER` y `MANAGER` dentro del mismo proyecto.
- Miembro de otro proyecto denegado aunque conozca el UUID.
- `PROJECTS_VIEW_ALL` sin permiso de acción: lectura permitida, escritura denegada.
- Override con ambos permisos permitido.
- Creador, asignado, organizador, participante y uploader en sus límites exactos.
- Intento de auto-escalamiento mediante usuarios o roles denegado.
- Intento de administrar al Owner denegado.
- Listados sin filtraciones entre proyectos.
