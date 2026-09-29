# Backend QA y deployment readiness

Fecha: 2026-09-28. Rama: `ai/backend-qa`.

## Resultado

QA de código final: **PASS**. Se ejecutaron individualmente `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` y `pnpm verify`, todos con salida 0. Suite final: 368 tests unitarios (26 archivos), 182 HTTP (13 archivos) y 19 de persistencia PostgreSQL (2 archivos). `verify` raíz no incluye HTTP/persistencia; ambas se ejecutaron aparte.

No se modificó código de `apps/web/**` ni `pnpm-lock.yaml`. No hubo push, publicación de imágenes ni despliegue VPS. Las pruebas usaron PostgreSQL y storage locales dedicados; no la base de desarrollo preexistente.

Deployment readiness es **condicional**, no una autorización de producción: falta validación operativa en VPS y el segundo build Docker final quedó bloqueado por disco C: sin espacio. La primera construcción de API/Caddy y el smoke de recuperación sí terminaron correctamente antes de ese límite.

## Áreas revisadas

- Auth/sessions: credenciales genéricas, Argon2id, tokens firmados, rotación por hash, replay, expiración, suspensión, revocación, logout-all, cambio de contraseña, cookies, CSRF/origin y throttling.
- Owner/users/invitations/RBAC: Owner único/inmutable, auto-modificación de estado/roles, concesión limitada por permisos efectivos, tokens de invitación de un uso, consumo transaccional, datos administrativos y auditoría.
- Projects/membership/tasks: scope SQL, IDOR entre proyectos, MANAGER/MEMBER/VIEWER, último manager, creadores/asignados, bajas lógicas y escrituras condicionales.
- Meetings/documents: scope, organizador/participantes, revisión optimista de notas, JSON Tiptap, streaming, allowlist/MIME/firma, límites, filenames UUID, traversal y borrado reintentable.
- Notifications/activity/audit: destinatarios actuales, filtrado por scope, endpoints read-only de auditoría y metadata sin secretos.
- Schedule/calendar/My Schedule: scope compartido, agregaciones sin nuevas tablas, fechas/timezone, pérdida de membresía, proyectos eliminados y validación negativa.
- Infraestructura/CI: imágenes no-root, PostgreSQL privado, proxy, volúmenes, startup ordering, migraciones, seed, backups/restore e instrucciones operativas.

La revisión combinó inspección de políticas y consultas con tests existentes y regresiones nuevas; no es una prueba formal de ausencia de vulnerabilidades ni una prueba de carga.

## Bugs confirmados y corregidos

1. **VIEWER podía escribir por una relación histórica.** Creator/assignee/organizer/participant/uploader permitían escribir tareas, reuniones/notas o eliminar documentos aunque la membresía actual fuera VIEWER o inexistente. Cinco rutas de escritura ahora exigen MEMBER + relación, MANAGER o override autorizado, además del permiso global. Regresiones unitarias fallaron antes del fix; HTTP prueba las cinco denegaciones tras degradación.
2. **Autocambio de estado mediante UUID en mayúsculas.** PostgreSQL reconoce el mismo UUID pero la comparación JS no. Se normaliza el comparison key y se verifica 403 sin cambiar ACTIVE.
3. **Último MANAGER retirable/degradable con UUID en mayúsculas.** El filtro contaba al propio target como otro manager. Dos regresiones fallaron antes del fix; comparación case-insensitive conserva el invariante.
4. **Notas aceptaban links ejecutables/JSON arbitrario.** Se validan nodos/marks/atributos Tiptap, URLs http/https/mailto, tamaño, profundidad y número de nodos. No se almacena HTML arbitrario. La autorización precede a validación/persistencia. Tests cubren javascript/data y otras entradas inseguras.
5. **Duraciones JWT inválidas aceptadas al arrancar.** `forever`, negativas, cero o inferiores a un segundo pasaban configuración. Validador exige una duración finita y positiva compatible con emisión de tokens.
6. **Reemisión de tokens podía escribir una sesión revocada.** UPDATE condicional verifica sesión, usuario, expiración, revokedAt y usuario ACTIVE; rotación también liga userId.
7. **Login/cambio de password podían usar una verificación obsoleta.** UPDATE de usuario condicionado por hash/estado/email serializa creación de sesión con revocación y evita sobrescribir un password cambiado concurrentemente. Tests simulan la modificación durante Argon2.
8. **Fallo operativo de refresh quemaba sesiones válidas.** Se distingue rechazo de sesión/replay de error de infraestructura: éste conserva la sesión y propaga error operativo, no una revocación falsa.
9. **Resend permitía reactivar invitación con permisos superiores.** Una invitación privilegiada revocada podía reenviarse por alguien con USERS_CREATE pero sin permisos para conceder sus roles. Se revalida la concesión actual antes de rotar token; HTTP reproduce 403 y confirma hash/revokedAt intactos. Resend/revoke tienen UPDATE condicional frente a aceptación concurrente.
10. **Multipart inválido devolvía 500.** Ausencia de file y campos extra producen 400 VALIDATION_ERROR; tamaño excesivo conserva 413. Tests unitarios/HTTP.
11. **Fechas imposibles se normalizaban silenciosamente.** Calendar aceptó febrero 30 en la regresión HTTP inicial. DTOs de schedule/proyectos/tareas usan validación ISO estricta.
12. **Auditoría mínima incompleta.** Login/fallos/refresh rechazado/logout/revocación/password, creación/baja/membresía de proyectos y uploads/deletes no estaban completamente registrados. Cambios críticos ahora escriben AuditLog en la misma transacción; auth fallido usa registro best-effort sin email/password suministrado. HTTP confirmó inicialmente ausencia de los siete eventos project/member/document y pasa después del fix.
13. **Delete concurrente duplicaba activity de documentos.** Sólo count > 0 genera activity/audit; cleanup físico sigue siendo idempotente. Tests prueban transición ya ganada y no borrado físico ante fallo de auditoría.
14. **Logs inesperados podían incluir secretos ORM.** El filtro no imprime error/stack arbitrario: registra requestId y tipo, responde genéricamente. Test introduce un secreto ficticio y comprueba que no se registra.

Además, respuestas API usan `Cache-Control: no-store`. No se añadió un bypass frontend ni se confió en autorización del cliente.

## Tests añadidos/reforzados

- `meeting-notes.spec.ts`: 14 casos de contenido válido, protocolos/atributos/nodos inseguros y límites.
- Auth/session/config: estado inactivo, expiración/revocación, reemisión condicional, carreras de password/login, error operativo de refresh y TTL inválido.
- Policies tasks/meetings/documents: denegación para VIEWER y membresía ausente.
- Project members: UUID uppercase remove/demote del último manager.
- Uploads: file ausente, multipart extra, rollback de audit, limpieza y deduplicación de delete.
- `backend-hardening.e2e-spec.ts`: 9 casos HTTP + PostgreSQL de degradación, membresía, suspensión/reactivación, invitación privilegiada, fechas, uploads y auditoría durable/redactada.
- `meeting-reminders.persistence-spec.ts`: 7 casos de timing, reinicio, retries, polls simultáneos, rollback tras insert, reprogramación y bajas/downtime.
- Se conservan suites existentes para replay/reuse, RBAC, IDOR, traversal, límites/signatures, optimistic revision, calendario y constraints de Owner/DB.

No se deshabilitaron tests ni se persiguió cobertura del 100%.

## Recordatorios persistentes

Antes había tabla/tipos pero no planificación/entrega operativa. Ahora:

- Se persisten offsets 1440 y 60 minutos en la misma transacción que crea/reprograma la reunión. Migration backfill añade pendientes futuros a reuniones existentes.
- Poller Nest lifecycle cada 30 segundos, sin Redis/BullMQ ni nueva dependencia. PostgreSQL conserva pendientes tras reinicios; shutdown espera entrega en curso.
- Lock de reunión, revalidación y notification + deliveredAt atómicos. Clave única por reminder/fecha/usuario y skipDuplicates evitan doble entrega.
- Reprogramación cambia fecha y permite la nueva entrega; modificaciones sin cambiar fecha no reenvían un recordatorio ya entregado.
- Sólo participantes ACTIVE con visibilidad actual. No retroactivos para reuniones iniciadas; bajas de reunión/proyecto se descartan. Ausencia prolongada puede hacer perder recordatorios de reuniones ya iniciadas, deliberadamente.
- Prueba PostgreSQL simula crash entre insert/mark: rollback y retry por una instancia nueva sin duplicados.

## Infraestructura y recuperación

- API empaqueta seed compilado (`dist-seed`); runtime no depende de tsx ni del source seed. `pnpm deploy --legacy` es compatible con el workspace actual sin cambiar lockfile.
- Entrypoint separa Node, `--migrate` y `--seed`. Compose gatea API por PostgreSQL healthy + migrate completado; bootstrap Owner es perfil explícito one-off, no variables permanentes de API.
- Rol app distinto del superuser, password/identificadores SQL quotados por psql/format, sin CREATEDB/CREATEROLE en volumen de producción nuevo. Dev shadow DB permite CREATEDB sólo al inicializar dev.
- API no-root, cap_drop ALL, no-new-privileges, init; PostgreSQL/API no publican puertos en producción; puertos dev limitados a loopback. Volúmenes PG/documents/Caddy y rotación de logs.
- Caddy limita request total, evita fallback SPA para API/health exactos y fuerza no-cache en index/rutas SPA. Storage nunca se monta en Caddy.
- `.env.example`, exclusiones de build/backup y `docs/DEPLOYMENT.md` cubren Windows, Linux, migraciones, bootstrap y privilegios reales.
- Backup detiene API/poller y captura dump + uploads con checksum; trap reanuda API. Restore sólo a proyecto aislado/volúmenes vacíos, valida hashes/paths/tipos tar, restaura SQL transaccionalmente y deja API apagada.

Validado localmente: Compose production/dev config, build inicial de ambas imágenes, usuarios runtime app/caddy, migraciones, seed production, PG app no-superuser/no-createdb/no-createrole, Caddy validate, readiness vía proxy, `/api` 404 y SPA no-cache. Backup/restore recuperó un Owner y archivo UUID de prueba; API restaurada pasó readiness. No fue una descarga real de documento relacionado ni una recuperación de datos productivos.

El segundo build API para incluir el último bloque de auditoría quedó bloqueado durante deploy de paquetes al agotarse C:. Se detuvo su cliente y se recuperaron aproximadamente 65 MiB, insuficientes para otra construcción segura. Docker comenzó a devolver 500; validaciones posteriores/cleanup no tienen resultado confirmado. Debe liberar espacio y repetir build/smoke de la imagen final. No se borraron datos ajenos ni se reinició Docker Desktop globalmente.

## CI

Workflow `.github/workflows/ci.yml`: PRs y push main/ai/backend-qa, permisos contents:read, actions fijadas por SHA, Node/pnpm fijados, concurrencia cancelable y timeouts. Job verify instala frozen lockfile y usa PostgreSQL aislado para lint/typecheck/unit/HTTP/persistence/build. Job Docker valida Compose/scripts, construye imágenes, comprueba migrate/seed/readiness/Caddy/cache y ensaya backup/restore. No auto-deploy, push de imágenes ni acceso a VPS.

YAML parseado/formateado correctamente. Una primera ejecución local de actionlint terminó sin errores; la repetición con shellcheck quedó sin resultado por la incidencia Docker. GitHub Actions no se ejecutó remotamente (no hubo push); no se declara CI remota verde.

## Recursos QA locales y limpieza pendiente

Docker sigue respondiendo 500, por lo que no se pudo confirmar limpieza. Sólo se crearon `backend-qa-postgres`, `backend-qa-caddy` y proyectos Compose `backend-qa-infra` / `backend-qa-infra-restore`. No eliminar el PostgreSQL de desarrollo preexistente. La configuración ficticia `.env.qa-infra` permanece ignorada para poder ejecutar, cuando Docker se recupere, `docker compose -p backend-qa-infra --env-file .env.qa-infra down --volumes` y el equivalente `-p backend-qa-infra-restore`; los dos contenedores standalone se pueden retirar por sus nombres exactos. Son exclusivamente fixtures desechables, no datos de negocio.

Storage de tests: `C:/Users/Dani/AppData/Local/Temp/backend-qa-validation-537cec`; backup ficticio: `C:/Users/Dani/AppData/Local/Temp/backend-qa-infra-backups`. No se hizo prune global ni limpieza de archivos ajenos. No se reinicia Docker Desktop automáticamente porque hay contenedores preexistentes fuera de esta tarea.

## Security findings y riesgos restantes

- `pnpm audit --prod` devuelve salida 1: **2 high + 1 moderate** en transitivas de Prisma CLI. deepmerge-ts 7.1.5: [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx). mysql2 3.15.3: [downgrade de autenticación](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr) y [inflate sin límite](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3). No se observó explotación en endpoints: PostgreSQL usa adapter-pg y Prisma config es estática; deepmerge requiere grafos cíclicos (JSON plano no basta). Esto es análisis de alcanzabilidad, no eliminación del riesgo. Actualizar transitivas/Prisma con pruebas de compatibilidad o aceptar riesgo explícitamente antes de producción; no se forzó major override ni se cambió lockfile.
- Auth `/me` sigue devolviendo identidad sin la proyección completa de roles/permisos/capacidades del contrato; perfiles enriquecidos usan extras vacíos. Son funcionalidades/API pendientes del scaffold, no autorizaciones frontend confiables. Coordinar su implementación y contrato antes de aceptación funcional.
- Rol runtime sigue siendo owner de DB/esquema; separar grants runtime/migration requiere preparación operativa. Scripts init no cambian volúmenes preexistentes.
- Backup diario/retención/cifrado/offsite, RPO/RTO, alertas y capacidad de disco no están provisionados. No hay scheduler externo de backups ni ensayo con datos/productores externos reales.
- TLS/DNS/firewall, secretos de producción, correo/push y escaneo de imágenes requieren validación operativa. Imágenes base usan tags major, no digests de release inmutables.
- Archivos permitidos no tienen antivirus/CDR; firmas no equivalen a demostrar que Office/ZIP/PDF son benignos. Se descargan como attachment bajo autorización y no se sirven estáticos.
- Acciones concurrentes dentro de una misma petición no se serializan universalmente con cambios de permisos/membresía; guards se reevalúan por petición. No se afirmó prueba exhaustiva de todos los interleavings ni se introdujeron locks globales hipotéticos.
- Poller puede procesar hasta 100 pendientes por ciclo; medir backlog y latencia antes de escala. Runtime V1 sigue siendo una API y storage local.

## Verificación final y estado de entrega

- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test`: PASS, 368 tests.
- `pnpm build`: PASS.
- `pnpm verify`: PASS, salida 0 después del último cambio backend.
- HTTP: PASS, 182 tests. Persistencia: PASS, 19 tests.
- Compose production/dev: PASS. Primer build/smoke Docker/restore: PASS. Build Docker final: BLOQUEADO por espacio local.
- Auditoría de dependencias: findings pendientes; no se confunde con verify.

Commits locales estables: backend `e1e298a`, recordatorios `48e9135`, hardening `299d109`, auditoría/último manager `aa03918`, infraestructura/runbooks `48326ad` y CI `4d95a88`. Este reporte se entrega en un commit documental separado. Ningún resultado de este documento autoriza desplegar.
