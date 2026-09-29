# Informe final V1 — integración, gaps y validación

Rama `ai/integration`, base `40ba24e` (merge de `ai/backend-qa` y `ai/frontend`). Fecha: 2026-09-28/29.
No hubo `git push`, publicación de imágenes ni despliegue a VPS. Este informe sólo afirma como
verificado lo que se ejecutó en esta sesión; lo demás figura en
[Lo que no se verificó](#lo-que-no-se-verificó).

## Resultado

**V1 lista para un ensayo en VPS, no autorizada para producción.** El código integrado pasa
`pnpm lint`, `typecheck`, `test`, `build` y `verify`; las pruebas HTTP y de persistencia contra
PostgreSQL pasan; la aplicación completa levantada con Docker Compose funcionó de extremo a
extremo en Chrome contra el backend real (sin mocks). La ejecución real encontró errores que los
tests unitarios no veían (enlace de invitación roto, calendario ilegible, deriva de contratos), ya
corregidos.

## Módulos funcionales

| Módulo | Estado |
|---|---|
| Autenticación, refresh, logout, sesiones | Verificado en navegador (login, restauración tras recargar, logout, refresh 401 tras logout) |
| Invitaciones y usuarios | Verificado: invitar, aceptar por el enlace real, reutilizar el enlace (rechazado), reenviar/revocar, suspender (sesión muerta al instante), reactivar |
| Roles y permisos | Verificado: `/auth/me` con roles y permisos; administrador **no Owner** ve sólo sus secciones; 403 del API para lo que la UI oculta |
| Proyectos y miembros | Verificado: crear, editar, añadir/cambiar/retirar miembros; el miembro retirado pierde acceso (404) |
| Tareas | Verificado: crear, asignar, completar (sigue visible), reabrir, eliminar |
| Cronograma, calendario, Mi cronograma | Verificado en escritorio, tablet y móvil |
| Reuniones y notas (Tiptap) | Verificado: crear, notas guardadas, conflicto de revisión sin sobrescribir |
| Documentos | Verificado: subir, nombre de quien sube, descargar (contenido íntegro), eliminar |
| Notificaciones | Verificado: campana, contador, navegación, marcar todas |
| Perfiles, equipo, dashboard, actividad | Verificado con datos reales del backend |
| Auditoría | Verificado: listado legible y sin secretos |
| PWA | Manifest válido, service worker activo, shell precacheado, ningún `/api` en caché, banner sin conexión (ver limitaciones) |

## Cambios de esta fase

**Backend**
- `/auth/me` y la respuesta de login devuelven `roles`, `permissions` (el Owner, el catálogo completo) y
  `capabilities.uploads`. Login lee los permisos *antes* de crear la sesión.
- `/me/profile` y `/users/:id/profile`: roles, proyectos activos/anteriores y tareas activas/terminadas
  reales, filtrados por el scope de quien consulta (`ProjectAccessService.buildProjectScope`); 3 consultas.
- `roles` en `/team`, `/users`, `/users/:id`; `GET /activity` (feed entre proyectos con scope en la consulta);
  `actor`/`project` en los eventos; `uploadedBy` en documentos.

**Frontend**
- `useAuth().can(...)`; navegación, rutas de administración (`RequirePermission`), dashboard como inicio
  (`DASHBOARD_VIEW`), y botones de crear/editar/eliminar siguen los permisos reales, combinados con el rol
  local y el override `PROJECTS_VIEW_ALL` (sólo pistas de UX).
- Badges de roles (equipo, usuarios, perfil), diálogo de roles con los roles actuales marcados, perfiles y
  dashboard con datos del servidor, límites de subida desde `/auth/me`.

**Errores reales hallados al ejecutar contra el stack real (todos corregidos)**
1. **Bloqueante:** el enlace de invitación (`/accept-invitation#token=…`) llevaba a una pantalla 404 — el frontend
   sólo tenía `/invitations/accept?token=`. Ahora ambas rutas, token leído del fragmento y retirado de la URL.
2. **Bloqueante de despliegue:** la imagen Caddy compilaba la web con la API en `http://localhost:3000`
   (además la CSP sólo permite `'self'`). El build de producción usa ahora `/api/v1` en el mismo origen.
3. Filtro y etiquetas de auditoría con 12 de las 26 acciones del backend; ahora las 26 y una prueba de contrato.
4. Calendario: etiquetas de reuniones y tareas terminadas ilegibles (blanco sobre tinte claro), días de otro mes
   sin contraste, vista de lista que desbordaba en móvil.
5. Estado de proyecto y rol local se mostraban como claves (`ACTIVE`, `MEMBER`).
6. Contraste de los badges de rol, selects sin nombre accesible, barra inferior móvil con "Mi cronograma"
   desalineado.
7. `sw.js` y el manifest ahora siempre se revalidan (Caddy).
8. Hallazgo de Codex (medio): `USERS_CREATE` sin `USERS_VIEW` no podía llegar a invitar; la pantalla admite ahora
   ambos permisos y sin `USERS_VIEW` muestra sólo la invitación.

## Gaps

Detalle en [FRONTEND_BACKEND_GAPS.md](./FRONTEND_BACKEND_GAPS.md).

**Resueltos:** permisos en `/auth/me`; perfiles reales; roles por persona; feed de actividad; nombre de quien
sube; límites de subida; acciones de auditoría; enlace de invitación.

**Decididos:** no se crea `GET /dashboard` (cinco lecturas acotadas con scope en la consulta, sin N+1; sólo la
actividad era mala y se resolvió con `GET /activity`). Web Push queda **fuera de V1** y la documentación lo dice.

**Diferidos conscientemente:** texto específico en notificaciones (`payload` sigue en `null`; la UI muestra un
texto genérico por tipo y navega bien), vista previa de invitación, fechas de `Project`/`Task` como instante
(documentado; el cliente lee 10 caracteres), autor en `REVISION_CONFLICT`, roles de una invitación pendiente.

## Tests

| Suite | Resultado |
|---|---|
| `pnpm lint` / `typecheck` / `build` / `verify` | exit 0 (lint web: 0 errores, 3 avisos preexistentes de `react-hooks/incompatible-library`) |
| API unitarios (`pnpm test`) | 385 en 26 archivos (368 previos + 17) |
| Web (`pnpm test`) | 118 en 26 archivos (84 previos + 34) |
| API HTTP + PostgreSQL (`test:e2e`, aparte de `verify`) | 202 en 14 archivos (182 previos + 20) |
| Persistencia PostgreSQL (`test:persistence`) | 19 en 2 archivos |

Pruebas nuevas relevantes: permisos efectivos y Owner en `/auth/me`; scope de perfiles (sin acceso, acceso
parcial, `VIEW_ALL`, Owner, bajas lógicas, usuario no activo, campos administrativos ausentes); scope del feed;
roles sin permisos en listados; `PATCH /me/profile` rechaza `roles`/`permissions`/`isOwner`; menús y rutas por
permiso; diálogo de roles precargado; lectura del token del fragmento; contraste de badges; y **pruebas de
contrato** que fallan si divergen las acciones de auditoría, tipos de actividad, claves de permiso o tipos de
notificación entre backend y frontend.

## Docker

- `docker compose config` (producción y con `docker-compose.dev.yml`): OK.
- `docker compose build`: **OK** en el intento final. Antes falló cuatro veces en `prisma generate` por
  `ETIMEDOUT` de Node dentro de Docker Desktop (red del entorno, no del repositorio; `wget` sí conectaba). Para
  seguir trabajando se construyó con una copia temporal del Dockerfile fuera del repositorio; el intento final
  con los Dockerfile reales terminó bien.
- `docker compose up -d` en un proyecto aislado (`erp-integration`, secretos nuevos, volúmenes vacíos, dominio
  `localhost` con el CA local de Caddy): postgres, migrate y api sanos; `/health/live` y `/health/ready` 200 por
  Caddy; `/api/v1/auth/me` sin token 401 con `no-store`; SPA con fallback `no-cache`; `sw.js` `no-cache`.
- Efecto lateral: `migrate` aplicó la migración `20260928153000_backfill_meeting_reminders` a la base de
  desarrollo `startup-erp-postgres-1` (estaba pendiente). No se tocaron sus datos ni su volumen.

## Pruebas manuales realizadas (Chrome real, headless, contra el stack Compose)

Automatizadas con Playwright (`playwright-core` + Chrome instalado) desde fuera del repositorio; no se añadió
dependencia. Regresión final sobre imágenes finales y volúmenes nuevos:

- Owner (9/9): login, restauración de sesión al recargar, sección de administración, usuarios con roles,
  diálogo de roles precargado, roles, equipo con badges, crear proyecto, añadir miembros, crear tarea.
- Administrador no Owner (9/9): aceptar invitación por el enlace real, enlace reutilizado rechazado,
  navegación restringida a sus permisos, roles en sólo lectura, proyectos visibles sin "Crear proyecto", API
  responde 403 a lo oculto, perfil ajeno con datos reales, usuario sin roles bloqueado en rutas admin.
- Developer/Viewer: dashboard con actividad legible, campana → tarea, completar/crear tareas, cronograma,
  calendario, Mi cronograma, reunión con participantes, subir/descargar/eliminar documento, actividad, perfil
  propio, logout, Viewer sin controles de escritura y 403 del API (15/17 en la corrida; las 2 restantes eran
  las notas Tiptap, ver abajo).
- Ciclo de vida (10/10): suspender/reactivar por UI, invitar/revocar, cambiar rol y retirar miembro (404 tras
  retirar), reabrir/eliminar tarea, proyecto a "Activo", notificaciones, auditoría legible y sin secretos.
- Notas Tiptap: el guardado y el conflicto `REVISION_CONFLICT` (borrador conservado, sin sobrescritura)
  pasaron en la reejecución específica (`13`, `13b`). En la corrida principal esos dos pasos fallaron por una
  espera errónea del script (tras guardar el editor sigue en modo edición, sin botón "Editar notas"), no por la
  aplicación.
- Un paso de documentos de una reejecución específica falló por una carrera del script (comprobó la API antes
  de que terminara el borrado); una comprobación directa por API confirmó `DELETE` 204 y lista vacía al instante.
- Caso `USERS_CREATE` sin `USERS_VIEW` (hallazgo de Codex): comprobado en navegador.
- Responsive con `axe-core` (WCAG 2.0/2.1/2.2 A y AA) en 19 pantallas: 1440, 768, 390 y 360 px. Sin
  desbordes horizontales ni violaciones tras las correcciones (los 360 px se repitieron tras un 429 de
  limitación de login que había dejado la primera pasada sobre la pantalla de login).
- Teclado: foco visible, el sheet de tarea atrapa el foco y Escape lo cierra, el login se completa sólo con teclado.
- Limitación de login (5/min por IP+email) comprobada de forma involuntaria (429).

## Codex

Una revisión de sólo lectura sobre los cuatro commits. Un hallazgo real (medio, acceso a invitar sin
`USERS_VIEW`), corregido. Sin hallazgos en exposición de perfiles/IDOR/N+1 ni en bloqueos de despliegue. Codex
no ejecutó builds ni tests.

## Lo que no se verificó

- **Instalación real de la PWA:** el único error de instalabilidad de Chrome fue `in-incognito` (el perfil de
  pruebas es efímero); el aviso de instalación no se ejercitó en un perfil normal ni en un móvil.
- Firefox, Safari/iOS, dispositivos físicos (sólo emulación de viewport), lectores de pantalla, modo oscuro.
- TLS con dominio real, DNS, firewall, SMTP real, backups/restauración con el esquema actual y con datos reales,
  rendimiento y carga, poller con mucho backlog.
- CI remota (no hubo push).
- Los scripts de navegador viven fuera del repositorio; no hay suite E2E de navegador en CI.

## Riesgos conocidos

- `pnpm audit --prod`: 3 hallazgos (2 altos, 1 moderado) en transitivas del CLI de Prisma (`deepmerge-ts`,
  `mysql2`), sin ruta alcanzable en runtime según el análisis de la fase de backend. Actualizar Prisma o aceptar
  el riesgo antes de producción.
- El rol de runtime de la aplicación sigue siendo dueño del esquema (separar grants de migración requiere
  preparación operativa).
- Sin antivirus ni CDR para archivos subidos; imágenes base con tags major, no digests.
- Notificaciones con texto genérico; asignación de roles falla con 403 si el administrador tiene menos
  permisos que un rol ya asignado a la persona (coherente con RBAC.md).
- La construcción de imágenes depende de la red; en Docker Desktop de esta máquina Node falló de forma
  intermitente hacia `binaries.prisma.sh` (IPv6/happy-eyeballs).

## Pasos necesarios para la VPS

1. Autorización operativa explícita; seguir [DEPLOYMENT.md](./DEPLOYMENT.md) (hardening del host, firewall 80/443).
2. `.env` desde `.env.example` con dominio real: `APP_DOMAIN`, `APP_BASE_URL` y `WEB_ORIGIN` con `https://` y
   `COOKIE_SECURE=true` (la API se niega a arrancar en producción si no). No hace falta ningún `VITE_*`.
3. Construir en la VPS o en CI (`docker compose build`), sin `docker-compose.dev.yml`; no publicar puertos de
   PostgreSQL ni de la API.
4. `docker compose up -d`; `migrate` corre antes de la API. Bootstrap del Owner una sola vez con el perfil
   `bootstrap`; iniciar sesión y cambiar la contraseña inmediatamente (`change-password`); quitar
   `OWNER_PASSWORD` del `.env`.
5. Comprobar `/health/ready` y un login real; aceptar una invitación con el enlace copiado.
6. Programar backups (`deploy/backup.sh`), ensayar `restore.sh` en un proyecto aislado y definir retención,
   cifrado y copia externa (no están provisionados). Vigilar el espacio en disco.
7. Resolver o aceptar por escrito los hallazgos de `pnpm audit`.

## Credenciales y secretos que deben regenerarse

Nada de lo usado en esta sesión debe llegar a producción:

- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `REFRESH_TOKEN_HASH_SECRET` (tres valores distintos, 32 bytes).
- `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` y `DATABASE_URL` (y `DATABASE_MIGRATION_URL` si se separa).
- `OWNER_EMAIL` y `OWNER_PASSWORD` de bootstrap (el de desarrollo es de ejemplo).
- SMTP (`SMTP_*`) si se activa. Las claves VAPID no se usan en V1.
- Los `.env` locales, la base de desarrollo y los volúmenes de prueba de esta fase no se reutilizan.
