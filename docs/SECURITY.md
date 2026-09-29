# Seguridad

## Objetivos

- Sólo usuarios activos y autorizados acceden a datos y acciones.
- Suspensión, deshabilitación y revocación cortan el acceso inmediatamente.
- Contraseñas, tokens, cookies y secretos nunca se almacenan ni registran en texto plano.
- Conocer un UUID o una ruta de archivo no concede acceso.
- Los cambios administrativos y de seguridad quedan auditados.
- La solución sigue siendo operable en una única VPS sin sacrificar controles básicos.

## Límites de confianza

Se consideran no confiables:

- navegador y cualquier cliente futuro;
- parámetros, headers, cookies y cuerpos HTTP;
- nombres, MIME y contenido declarados durante uploads;
- IDs de usuarios, proyectos y recursos enviados por el cliente;
- contenido Tiptap y URLs incluidas en notas;
- direcciones IP y user-agent, que son metadata y no identidad.

Caddy, API y PostgreSQL se comunican en una red privada de despliegue. Sólo Caddy expone puertos públicos. El volumen de documentos no se publica como directorio estático.

## Contraseñas

- Hash con Argon2id mediante una librería mantenida.
- Parámetros calibrados para la VPS y almacenados dentro del hash; revisar al cambiar hardware o librería.
- Salt único generado por la implementación de Argon2id.
- Longitud mínima inicial de 12 caracteres y máxima razonable para evitar abuso de recursos; no imponer reglas de composición arbitrarias.
- Permitir passphrases y pegar desde gestores de contraseñas.
- Nunca truncar silenciosamente.
- Rehash transparente después de un login válido cuando cambien los parámetros recomendados.
- Respuestas de login genéricas para no revelar si existe el email.

`passwordHash` puede ser nulo únicamente para un usuario `INVITED`. No se envía por API, logs, auditoría ni eventos.

Cambiar contraseña exige la contraseña actual, aplica el nuevo hash en transacción y revoca las demás sesiones. El flujo inicial del Owner debe permitir rotar la contraseña del bootstrap. Recuperación de contraseña por email queda fuera de V1 hasta diseñar su token y proceso; no se improvisa mediante una edición administrativa del hash.

## Tokens y sesiones

### Access token

- JWT firmado con secreto exclusivo de acceso.
- TTL aproximado de 15 minutos.
- Claims mínimos: `sub` (usuario), `sid` (sesión), `type = access`, `iat` y `exp`.
- No incluir roles, permisos ni datos personales que puedan quedar obsoletos.
- El cliente web lo conserva en memoria y lo envía en `Authorization: Bearer`.
- Nunca guardarlo en `localStorage` o `sessionStorage`.

Cada petición comprueba firma, expiración, tipo, sesión vigente y estado `ACTIVE` del usuario. Esta consulta intencional permite revocación inmediata; V1 no optimiza esa comprobación con caches que puedan mantener permisos obsoletos.

### Refresh token

- JWT firmado con un secreto distinto al access token.
- TTL aproximado de 7 días.
- Claims mínimos: `sub`, `sid`, `type = refresh`, `jti`, `iat` y `exp`.
- Se rota en cada refresh exitoso.
- PostgreSQL conserva únicamente un hash criptográfico del token.

Como el token posee alta entropía, el hash de almacenamiento puede ser HMAC-SHA-256 con una clave independiente `REFRESH_TOKEN_HASH_SECRET`. Argon2id queda reservado para contraseñas humanas. La comparación es constant-time.

El refresh se realiza dentro de una transacción:

1. Validar firma, tipo y expiración.
2. Cargar sesión y usuario.
3. Comprobar que la sesión no esté revocada y que el usuario siga `ACTIVE`.
4. Comparar el hash presentado con `refreshTokenHash`.
5. Emitir un nuevo par, reemplazar el hash y actualizar `lastActivityAt`.

Un token válido de firma cuyo hash ya no coincide se trata como token rotado o posible replay: se rechaza y se revoca la sesión afectada, registrando un evento seguro. El frontend debe evitar refresh paralelos mediante una única operación compartida.

### Cookie web

La cookie de refresh usa:

- `HttpOnly` siempre;
- `Secure` en producción;
- `SameSite=Lax` cuando web y API son same-site;
- `Path=/api/v1/auth`;
- `Max-Age` coherente con el TTL;
- sin atributo `Domain` salvo necesidad demostrada.

Producción usa exclusivamente HTTPS. La cookie no contiene datos adicionales legibles por JavaScript.

### Logout y revocación

- Logout actual marca la sesión `revokedAt` y limpia la cookie.
- Logout global revoca todas las sesiones del usuario.
- El usuario puede listar y revocar una sesión propia por UUID.
- Suspender o deshabilitar revoca todas las sesiones en la misma transacción.
- Reactivar no restaura sesiones; requiere nuevo login.
- Los registros revocados pueden conservarse temporalmente para seguridad y luego purgarse con una política explícita.

## CSRF y CORS

El access token Bearer evita que las operaciones normales dependan de autenticación implícita por cookie. Los endpoints de refresh y logout sí reciben cookie y deben protegerse:

- `SameSite=Lax` y despliegue same-site en V1;
- validación de `Origin` contra el origen web permitido en peticiones de navegador;
- CORS con allowlist exacta, nunca `*` junto con credenciales;
- sólo métodos y headers requeridos;
- si en el futuro web y API pasan a sitios distintos, añadir un token CSRF explícito antes de relajar `SameSite`.

## Invitaciones

- Token aleatorio de al menos 256 bits, temporal, de un solo uso.
- Hash HMAC-SHA-256 o SHA-256 almacenado; nunca el token completo.
- TTL configurable, con 72 horas como valor inicial.
- El enlace puede transportar el token en el fragmento URL para que no llegue a access logs; el frontend lo envía después en el cuerpo de aceptación.
- No registrar URL completa, token, hash ni cuerpo de aceptación.
- Aceptar, revocar y reenviar son operaciones atómicas y auditadas.
- Reenviar invalida el token anterior.
- La respuesta pública no confirma más información de la necesaria.

Si SMTP no está configurado, el enlace completo sólo se muestra al administrador en la respuesta de creación o reenvío y no vuelve a estar disponible después.

## Autorización e IDOR

Se aplica [RBAC.md](./RBAC.md) en servicios/políticas backend. Reglas obligatorias:

- cargar el recurso real y derivar su proyecto desde PostgreSQL;
- comprobar permiso global, scope de proyecto, rol local y relación con recurso;
- aplicar scope en listados y búsquedas, no filtrar después en frontend;
- responder `404` cuando confirmar existencia facilitaría enumeración;
- no aceptar `createdById`, `uploadedById`, `organizerId` u otros campos de autoridad sin validación específica;
- DTOs con allowlist para evitar mass assignment;
- nunca enlazar directamente un body a un update Prisma genérico.

Las políticas se prueban con usuarios de otros proyectos y UUID válidos obtenidos fuera de su scope.

## Protección del Owner y administración

- Un índice único parcial limita a un solo Owner.
- El servicio rechaza delete, suspensión, deshabilitación o cambio de `isOwner`.
- `isOwner` no aparece en DTOs administrativos normales.
- Un no-Owner no cambia sus propios roles ni estado.
- Al asignar o editar roles, el backend impide conceder permisos que el actor no posee.
- Roles y permisos se vuelven a leer para cada operación sensible; no se confía en claims antiguos.
- La contraseña inicial del Owner entra por secreto de entorno, no por argumentos visibles ni logs, y debe rotarse después del bootstrap.

## Validación de entrada

- Pipes globales de NestJS con transformación controlada, allowlist y rechazo de propiedades desconocidas.
- Límites de longitud, arrays, páginas y rangos de fecha.
- UUID validados antes de consultar.
- Enums cerrados.
- URLs aceptan sólo protocolos permitidos.
- Queries Prisma parametrizadas; cualquier SQL raw usa parámetros y revisión explícita.
- Errores de validación no incluyen stack traces ni datos internos en producción.

La validación Zod del frontend es UX. No sustituye DTOs ni reglas backend.

## Notas Tiptap y XSS

- Guardar JSON compatible con un schema Tiptap conocido, no HTML arbitrario.
- Validar tamaño, profundidad y tipos de nodos/marks en backend.
- Admitir sólo extensiones documentadas para V1.
- Links permiten `https`, `http` cuando corresponda y `mailto`; rechazar `javascript:`, `data:` y protocolos desconocidos.
- Renderizar mediante Tiptap/React sin inyectar HTML no sanitizado.
- Si se exporta a HTML en el futuro, sanitizar con allowlist antes de entregar o persistir.

## Uploads y documentos

- Tamaño máximo configurable y aplicado durante streaming, antes de agotar memoria o disco.
- Allowlist de extensiones y tipos necesaria para V1; validar firma/magic bytes cuando sea posible.
- No confiar sólo en filename o MIME del cliente.
- Nombre original sanitizado para UI y headers; nunca usarlo como ruta.
- `storageKey` aleatorio generado por servidor.
- Resolver y comprobar que cualquier ruta final permanezca dentro de `STORAGE_ROOT`.
- Archivos fuera del web root y sin permiso de ejecución.
- Descarga únicamente mediante endpoint autorizado, con `Content-Disposition` seguro y `X-Content-Type-Options: nosniff`.
- Evitar path traversal, overwrite y enlaces simbólicos fuera del volumen.
- Eliminar de forma idempotente y auditar actor, documento y proyecto.

Escaneo antivirus puede añadirse cuando el riesgo o los tipos admitidos lo justifiquen. Hasta entonces se mantiene una allowlist conservadora y límites estrictos.

## Rate limiting y abuso

Aplicar límites más estrictos a:

- login;
- refresh;
- creación y aceptación de invitaciones;
- uploads;
- endpoints de búsqueda costosa.

En V1, una combinación de Caddy y limitación en la única instancia backend es suficiente. Los límites por IP se combinan con email o sesión cuando sea útil y no se usan como única defensa. Responder `429` con espera razonable sin revelar si una cuenta existe.

## Headers y navegador

Caddy o NestJS deben establecer:

- HSTS sólo en producción HTTPS y después de verificar el dominio;
- Content Security Policy compatible con la PWA y sin `unsafe-eval` en producción;
- `X-Content-Type-Options: nosniff`;
- política de referrer restrictiva;
- protección de framing mediante CSP `frame-ancestors`;
- permisos del navegador limitados mediante `Permissions-Policy`.

No exponer Swagger UI públicamente sin una decisión operativa. El documento OpenAPI puede restringirse a usuarios administrativos o a la red de gestión en producción.

## PWA, caché y Web Push

- El service worker cachea assets estáticos versionados, no respuestas autenticadas ni documentos por defecto.
- Al logout se limpia cualquier estado de aplicación sensible controlado por la página.
- No guardar access/refresh tokens en IndexedDB o Cache Storage.
- La PWA no ofrece mutaciones offline en V1.
- Web Push no está implementado en V1. Si se añade, requerirá consentimiento explícito y claves VAPID protegidas.
- El payload push contiene información mínima y no sensible; al abrirlo, la aplicación vuelve a autorizar y cargar el recurso.
- Un fallo de push no revierte la notificación interna.

## Secretos y configuración

- Secretos sólo mediante variables de entorno o mecanismo de secretos del host.
- Secretos separados para access JWT, refresh JWT y hash de refresh.
- No usar valores por defecto inseguros en producción.
- Validar longitud y presencia al arrancar.
- No incluir secretos en variables `VITE_*`, imágenes, repositorio, logs o Swagger.
- Rotar secretos con un procedimiento que considere sesiones activas; una rotación de JWT puede invalidarlas deliberadamente.
- Credenciales de PostgreSQL con mínimo privilegio y base no accesible desde Internet.

## Logs, actividad y auditoría

Los logs de aplicación incluyen timestamp, nivel, servicio, requestId, ruta normalizada, código y duración. Pueden incluir IDs internos necesarios, pero no:

- contraseñas o hashes;
- JWT, cookies o tokens de invitación;
- headers `Authorization` o `Cookie`;
- cuerpos completos de auth, notas o archivos;
- variables de entorno;
- URLs con secretos.

Auditar como mínimo:

- login exitoso y fallido sin revelar contraseña;
- refresh rechazado por replay o sesión inválida;
- logout y revocaciones;
- creación, aceptación, reenvío y revocación de invitaciones;
- cambios de estado y roles de usuario;
- cambios de roles y permisos;
- creación, baja y membresía de proyectos;
- uploads y deletes de documentos;
- accesos administrativos a auditoría cuando resulte útil.

La auditoría es append-only desde la aplicación y su metadata se redacta antes de persistir.

## PostgreSQL y backups

- PostgreSQL sólo en red privada de Docker.
- Usuario de aplicación sin privilegios de superusuario.
- Migraciones con credencial separada si la operación lo permite.
- Backups de base y documentos cifrados o almacenados en un destino con controles equivalentes.
- Acceso a backups limitado y registrado.
- Probar restauraciones; un backup no probado no se considera recuperable.
- No copiar datos reales a desarrollo sin anonimización.

## Dependencias y build

- Versiones fijadas mediante lockfile.
- Revisar advisories y actualizar de forma controlada.
- No instalar paquetes innecesarios ni ejecutar scripts de fuentes desconocidas.
- Builds reproducibles con instalación frozen en CI o despliegue futuro.
- No exponer sourcemaps públicos de producción salvo una estrategia segura de observabilidad.

## Respuesta a incidentes

Ante sospecha de credenciales o tokens comprometidos:

1. Revocar sesiones afectadas o todas las sesiones.
2. Suspender temporalmente cuentas cuando sea necesario.
3. Rotar secretos implicados y credenciales de infraestructura.
4. Preservar logs y auditoría sin alterarlos.
5. Determinar recursos y ventana temporal afectados.
6. Restaurar o corregir mediante cambios revisados; no borrar evidencia.
7. Documentar causa y medidas preventivas.

## Verificación de seguridad futura

- Tests permitidos y denegados para cada política RBAC.
- Tests de sesión expirada, revocada y usuario suspendido.
- Tests de rotación y replay de refresh.
- Tests CSRF/Origin y CORS.
- Tests de mass assignment e IDOR.
- Tests de traversal, MIME, tamaño y autorización de documentos.
- Tests XSS de notas y nombres de archivo.
- Confirmación de redacción de logs.
- Revisión de secretos versionados, headers, backups y configuración antes de release.
