# Frontend ↔ backend gaps

Registro de las diferencias entre lo que `docs/` promete, lo que ofrecía la API y lo
que necesitaba el frontend. Se abrió durante `ai/frontend` y se cerró en la fase de
integración (`ai/integration`, informe en [FINAL_V1_REPORT.md](./FINAL_V1_REPORT.md)).

Clasificación: **blocker V1** (impide un flujo de aceptación o autoriza mal),
**should-fix V1** (degrada de forma visible o crea un riesgo operativo barato de evitar)
y **diferido** (funciona, se acepta conscientemente y se documenta).

## Resumen

| # | Gap | Clase | Estado |
|---|---|---|---|
| 1 | `/auth/me` sin roles ni permisos efectivos | blocker | **Resuelto** |
| 2 | Perfiles con roles/proyectos/tareas vacíos | blocker | **Resuelto** |
| 3 | Ningún endpoint devolvía los roles de una persona (equipo, admin, prefill de roles) | should-fix | **Resuelto** |
| 4 | `GET /dashboard` no existe | — | **Decidido: no se crea** (ver abajo) |
| 5 | Sin feed de actividad entre proyectos ni nombres en los eventos | should-fix | **Resuelto** (`GET /activity` + actor/proyecto) |
| 6 | Documentos sin nombre de quien sube | should-fix | **Resuelto** (`uploadedBy`) |
| 7 | Límites de subida sólo en configuración del servidor | should-fix | **Resuelto** (`/auth/me` → `capabilities.uploads`) |
| 8 | Web Push sin endpoints | diferido | **Diferido** fuera de V1; docs actualizadas |
| 9 | Auditoría con sólo 12 acciones | should-fix | **Resuelto** (el backend ya registra 26; el frontend estaba desactualizado) |
| 10 | Enlace de invitación (`/accept-invitation#token=`) sin ruta en el frontend | blocker | **Resuelto** (hallado al ejecutar contra el backend real) |
| 11 | `GET /roles` para no privilegiados | — | **Confirmado**: `{ id, name, color, position }`; con `ROLES_VIEW` añade descripción y permisos |
| 12 | No hay `GET` para previsualizar una invitación | diferido | Diferido |
| 13 | Notificaciones sin texto ni nombres (`payload` siempre `null`) | should-fix | **Diferido** conscientemente |
| 14 | Fechas de calendario serializadas como instante en `Project`/`Task` | diferido | Diferido; contrato documentado en API.md |
| 15 | `REVISION_CONFLICT` no dice quién guardó | diferido | Diferido |
| 16 | Roles de una invitación pendiente no se listan | diferido | Diferido |
| 17 | Notas de reunión (Tiptap) | — | Confirmado, sin acción |

## Resueltos

### 1. `/auth/me` con roles y permisos efectivos

`GET /auth/me` y la respuesta de login devuelven ahora `roles`, `permissions` y
`capabilities` (ver [API.md](./API.md)). El Owner recibe el catálogo completo, de modo que
el frontend no necesita tratarlo como caso especial. El frontend expone `can(...keys)` en
`useAuth()` y lo usa para la navegación, las rutas de administración, el dashboard como
página de inicio y los botones de crear/editar/eliminar. Un administrador con roles
propios ve exactamente sus secciones. La autoridad sigue siendo el backend: cada petición
se autoriza de nuevo y las pruebas HTTP comprueban que lo que la interfaz oculta responde
`403`.

### 2. Perfiles con datos reales

`/me/profile` y `/users/:id/profile` devuelven roles, proyectos activos y anteriores y
tareas activas y terminadas, **filtrados por el scope de quien consulta** (mismo
`buildProjectScope` que los listados). Tres consultas acotadas, sin lecturas por
proyecto. Pruebas negativas: observador sin acceso, observador con acceso parcial,
`PROJECTS_VIEW_ALL`, proyectos y tareas dados de baja, usuario no activo, campos
administrativos ausentes.

### 3. Roles de cada persona

`/team`, `/users` y `/users/:id` incluyen `roles` (resúmenes, nunca permisos). El diálogo
de asignar roles abre con los roles reales marcados, por lo que guardar sin cambios ya no
retira nada por accidente.

### 5. Feed de actividad

`GET /activity` aplica el scope en la consulta y cada evento trae `actor` y `project`. El
dashboard pasó de un abanico de hasta cuatro lecturas (que además ignoraba el resto de
proyectos) a una sola.

### 6–7. Nombre de quien sube y límites de subida

`uploadedBy: { id, firstName, lastName }` en los documentos. Los límites llegan en
`/auth/me` y el build de producción ya no depende de `VITE_MAX_UPLOAD_BYTES` (que en la
imagen de Docker nunca se establecía, así que un cambio de `MAX_UPLOAD_BYTES` habría
bloqueado subidas legítimas en el navegador).

### 9. Auditoría

El backend registra 26 acciones (auth, proyectos, miembros, documentos, usuarios, roles).
El filtro y las etiquetas del frontend cubrían 12; ahora cubren las 26 y una prueba de
contrato falla si divergen.

### 10. Enlace de invitación

La API genera `{WEB_ORIGIN}/accept-invitation#token=…`; el frontend sólo tenía
`/invitations/accept?token=`. Con el enlace real se llegaba a la pantalla 404. Ahora
existen ambas rutas, el token se lee del fragmento y se elimina de la barra de
direcciones.

## Decisiones

### 4. Dashboard sin endpoint propio

Se evaluó la composición actual: cinco lecturas acotadas, cada una sobre un endpoint que
ya filtra por scope en la consulta y con paginación. No hay N+1 y un fallo sólo afecta a
su bloque. El único punto realmente malo era la actividad (abanico de hasta cuatro
proyectos arbitrarios), que se resolvió con `GET /activity`. Crear `GET /dashboard`
duplicaría cinco consultas en un segundo read model que mantener. `DASHBOARD_VIEW` decide
si la interfaz muestra el dashboard como inicio (si falta, se aterriza en Mi cronograma).

### 8. Web Push

V1 no lo implementa: sin endpoints de suscripción ni entrega y sin interfaz de opt-in.
Las notificaciones internas y los recordatorios persistentes funcionan (probado contra
el backend real). Las variables VAPID se validan pero no se usan. `PRODUCT.md`,
`ARCHITECTURE.md`, `UI-UX.md` y `DEPLOYMENT.md` lo reflejan.

## Diferidos (aceptados para V1)

- **Notificaciones sin texto específico.** Las notificaciones traen sólo ids; la interfaz
  compone un texto genérico por tipo ("Se te asignó una tarea en un proyecto") y navega
  bien. Mejora sugerida: rellenar `payload` con `{ taskTitle, meetingTitle, projectName }`
  al crear la notificación (cinco puntos de llamada más el scheduler de recordatorios).
- **Vista previa de invitación.** No hay `GET` para mostrar a quién se invita antes de
  fijar la contraseña; `/accept-invitation` muestra sólo el formulario y trata cualquier
  token inválido/usado/expirado con un mensaje no enumerable.
- **Fechas de calendario.** `Project` y `Task` serializan `@db.Date` como
  `…T00:00:00.000Z`; el frontend lee sólo los 10 primeros caracteres (`lib/dates.ts`, con
  pruebas en UTC−5). Los read models ya devuelven `YYYY-MM-DD`.
- **`REVISION_CONFLICT`** informa de la revisión y la hora, no de quién guardó.
- **Roles de una invitación pendiente** no se muestran en la lista de invitaciones (sí en
  el usuario invitado, que ya recibe sus roles al crearse).
- **Asignar roles y anti-escalamiento.** El reemplazo completo valida todos los roles del
  conjunto, incluidos los que la persona ya tenía: un administrador con menos permisos que
  un rol existente del usuario recibe `403` aunque sólo quiera añadir otro rol. Es
  coherente con RBAC.md ("asignar o retirar roles permitidos") y la interfaz explica el
  motivo.
