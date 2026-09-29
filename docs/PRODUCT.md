# Producto

## Propósito

La plataforma es el ERP interno de una única startup pequeña de desarrollo de software. Centraliza personas, acceso, proyectos y trabajo diario sin intentar sustituir herramientas contables, de ventas o de soporte.

La V1 será una aplicación web responsive e instalable como PWA. Debe funcionar bien en escritorio, tablet y móvil. No habrá aplicación móvil nativa en V1, pero la API REST se diseñará para admitir en el futuro un cliente React Native/Expo sin trasladar reglas de negocio al frontend.

## Objetivos de la V1

- Administrar usuarios, invitaciones, perfiles, roles y permisos.
- Organizar proyectos, sus miembros y el trabajo asociado.
- Usar una única tarea como fuente para listas, cronogramas, calendarios, dashboard y perfiles.
- Coordinar reuniones y mantener notas con protección contra sobrescrituras silenciosas.
- Almacenar documentos de proyecto con acceso controlado.
- Informar al usuario mediante notificaciones persistentes y recordatorios.
- Ofrecer actividad operativa por proyecto y auditoría administrativa.
- Mantener una arquitectura simple que una startup pequeña pueda operar en una sola VPS.

## Principios del producto

- PostgreSQL y el backend son la fuente de verdad.
- La autorización se aplica siempre en el backend; ocultar controles en la interfaz sólo mejora la experiencia.
- V1 sirve a una sola organización y no implementa multi-tenancy.
- El sistema conserva el historial: deshabilitar o archivar tiene preferencia sobre borrar datos con referencias históricas.
- Las vistas derivadas no duplican entidades. Calendarios, cronogramas y dashboard consultan tareas y reuniones existentes.
- Las notificaciones internas son el canal principal. El email es un complemento opcional; Web Push queda fuera de V1.
- Las fechas de reuniones representan instantes; las fechas de proyectos y tareas son fechas de calendario. La UI muestra los instantes en la zona horaria del usuario.

## Actores

### Organization Owner

Cuenta especial y única con acceso completo. Se crea de forma idempotente mediante variables de entorno y un seed inicial. No es un rol configurable: se representa como una propiedad protegida del usuario.

El Owner puede administrar usuarios, roles, permisos, proyectos y auditoría. No puede eliminarse y ningún otro usuario puede suspenderlo, deshabilitarlo o modificar su condición de Owner.

### Administrador autorizado

Usuario activo cuyas combinaciones de roles le conceden permisos administrativos. Puede realizar únicamente las operaciones expresamente permitidas y nunca adquirir o conceder privilegios que no puede administrar.

### Miembro del equipo

Usuario activo que trabaja en proyectos según sus permisos globales y su pertenencia y rol en cada proyecto.

### Viewer de proyecto

Miembro con acceso de lectura a un proyecto. No puede modificar recursos sólo porque la interfaz se los muestre.

## Alcance funcional

### Autenticación y sesiones

- Inicio de sesión con email y contraseña.
- Access token de corta duración, aproximadamente 15 minutos.
- Refresh token rotado, con duración aproximada de 7 días, almacenado en web mediante cookie `HttpOnly`.
- Cierre de la sesión actual, de todas las sesiones propias y revocación de una sesión específica.
- Listado de sesiones propias para reconocer dispositivos.
- Revocación de todas las sesiones al suspender o deshabilitar un usuario.
- No existe registro público.

Los usuarios `INVITED` todavía no pueden iniciar sesión. Sólo los usuarios `ACTIVE` pueden mantener acceso. Los estados `SUSPENDED` y `DISABLED` bloquean login, refresh y uso de access tokens existentes.

### Invitaciones

Un administrador autorizado crea una invitación indicando email, nombre y roles iniciales. El sistema genera un token temporal, de un solo uso, y nunca guarda ni registra el token completo.

Si SMTP está configurado, se podrá enviar el enlace. Si no lo está, la UI mostrará una única vez un enlace que el administrador pueda copiar manualmente. Al aceptar una invitación vigente, el usuario define su contraseña, recibe los roles previstos y pasa a `ACTIVE`.

### Usuarios y perfiles

Los administradores autorizados pueden listar, buscar, crear o invitar, editar, asignar o retirar roles, suspender, reactivar y deshabilitar usuarios.

El perfil muestra:

- avatar, nombre y email;
- roles globales con sus colores;
- proyectos activos y anteriores;
- tareas activas y terminadas.

Los usuarios con permiso pueden administrar roles desde el perfil de otra persona. Los usuarios con historial no se eliminan físicamente.

### Roles y permisos globales

Los permisos son capacidades conocidas por el backend. Los roles son agrupaciones configurables desde la UI con nombre, descripción, color y posición de presentación. Un usuario puede tener varios roles y sus permisos efectivos son la unión de esos roles.

La posición y el color de un rol son presentación, no una fuente implícita de autoridad. El detalle de permisos, asignación segura y combinación con acceso de proyecto está en [RBAC.md](./RBAC.md).

### Proyectos

Un proyecto contiene nombre, descripción, cliente opcional, estado, fechas, creador, miembros y recursos de trabajo. Sus estados son:

- `PLANNED`
- `ACTIVE`
- `PAUSED`
- `COMPLETED`
- `CANCELLED`

El listado de proyectos admite búsqueda, orden por creación o fechas y filtros para activos, finalizados, pausados, próximos a terminar y atrasados. Un proyecto está atrasado cuando su fecha esperada de fin ya pasó y no está completado ni cancelado.

El detalle usa estas secciones:

- Overview
- Tareas
- Cronograma
- Calendario
- Reuniones
- Documentos
- Miembros
- Actividad

### Miembros de proyecto

La pertenencia se modela de forma independiente de los roles globales. Cada `ProjectMember` tiene uno de estos roles locales:

- `MANAGER`: administra el trabajo y, con el permiso global correspondiente, los miembros del proyecto.
- `MEMBER`: contribuye al trabajo del proyecto dentro de sus permisos globales.
- `VIEWER`: acceso de lectura.

Un usuario puede tener, por ejemplo, un rol global Developer y ser `MANAGER` en un proyecto concreto. Ni el rol global ni la pertenencia local bastan por sí solos para elevar privilegios.

### Tareas

Las tareas son deliberadamente simples. Contienen proyecto, título, descripción opcional, fecha inicial, fecha límite, estado, creador, asignados y marcas de tiempo. Sus estados son:

- `PENDING`
- `IN_PROGRESS`
- `DONE`

Una tarea tiene uno o varios asignados mediante `TaskAssignee`. Al completarla se establece `DONE` y `completedAt`; al reabrirla se limpia `completedAt`. Las tareas terminadas permanecen visibles con menor énfasis visual.

La misma tarea alimenta la lista del proyecto, cronograma, calendario, Mi cronograma, dashboard y perfil. V1 no incluye subtareas, dependencias, story points, prioridad, tags, estimaciones ni workflows configurables.

### Cronograma

Vista temporal sencilla de tareas, no un Gantt empresarial. Muestra título, rango `startDate` a `dueDate`, asignados y estado. Las tareas terminadas se distinguen con menor opacidad, un check y texto accesible; el color nunca es el único indicador.

### Calendario de proyecto

Combina tareas y reuniones del proyecto, diferenciadas visualmente. Seleccionar un elemento abre sus detalles en drawer en escritorio y en una superficie adaptada a móvil. Esta vista no crea copias de tareas ni reuniones.

### Mi cronograma

Sección global limitada al usuario autenticado. Combina sus tareas asignadas y reuniones en las que participa.

Filtros:

- todos, tareas o reuniones;
- proyecto;
- rango de fechas;
- estado.

Vistas:

- calendario;
- lista cronológica.

### Reuniones y notas

Una reunión pertenece a un proyecto e incluye título, agenda opcional, inicio, fin, organizador, participantes, notas y una revisión de concurrencia.

El organizador autorizado puede editar o eliminar la reunión y administrar participantes antes o después del evento. Los participantes con autorización pueden editar las notas. Las notas usan Tiptap y admiten texto, headings, negrita, cursiva, listas, listas numeradas, links y checklist cuando no añada complejidad significativa.

V1 no ofrece edición colaborativa en tiempo real. Cada edición de notas envía la revisión conocida; si otra persona guardó primero, la API rechaza la sobrescritura y permite recargar o reconciliar el contenido.

En V1 las notas son notas de reunión. No existe un módulo independiente de wiki o notas libres.

### Documentos

Los documentos pertenecen a proyectos. Los usuarios autorizados pueden subir, listar, descargar y eliminar según permisos. PostgreSQL guarda sólo metadata; el binario se almacena en un volumen persistente privado de la VPS.

La aplicación conserva una interfaz `StorageService` para poder sustituir el almacenamiento local por S3, Cloudflare R2 o MinIO. V1 no incluye versionado complejo de documentos.

### Notificaciones y recordatorios

Las notificaciones son persistentes, tienen estado leído/no leído y enlazan al recurso correspondiente. La campana global muestra el contador de no leídas.

Casos mínimos:

- asignación a una tarea;
- incorporación a una reunión;
- cambio significativo de una reunión;
- recordatorio 24 horas antes;
- recordatorio 1 hora antes.

Los recordatorios se calculan mediante un scheduler de NestJS que consulta PostgreSQL. Deben sobrevivir reinicios y evitar duplicados; no dependen de timers exclusivamente en memoria. V1 ejecuta una sola instancia del backend y no introduce Redis o BullMQ.

Web Push **no forma parte de V1**: no hay endpoints de suscripción ni entrega, y la interfaz no ofrece activarlo. Las notificaciones internas (campana e historial) y los recordatorios persistentes cubren el caso de uso. Si se retoma, será una mejora progresiva que nunca impida usar la aplicación.

### Dashboard y equipo

El dashboard (sin endpoint dedicado: se compone de lecturas existentes, ver [API.md](./API.md)) prioriza:

- Mis tareas;
- próximas reuniones;
- mis proyectos;
- actividad reciente;
- equipo.

La sección Equipo muestra avatar, nombre y badges de roles con colores. Puede inspirarse en la legibilidad de comunidades como Discord, pero no copiar su interfaz ni convertir la posición visual en autoridad.

### Actividad y auditoría

La actividad es una cronología legible dentro del proyecto: cambios relevantes de tareas, reuniones, miembros y documentos. La ven los usuarios con acceso al proyecto.

La auditoría es un registro administrativo, append-only, de operaciones sensibles como autenticación, cambios de usuarios, roles, permisos, membresías, documentos y revocaciones. Sólo la ve quien tenga `AUDIT_VIEW`. Nunca almacena contraseñas, tokens completos, cookies ni contenido sensible innecesario.

## Flujos esenciales de aceptación

La V1 se considera funcional cuando permite, con autorización backend y registros de auditoría apropiados:

1. Crear el Owner inicial e iniciar sesión de forma segura.
2. Invitar un usuario, aceptar la invitación y asignarle roles.
3. Crear un proyecto, añadir miembros con roles locales y limitar correctamente su acceso.
4. Crear y asignar una tarea y verla en todas las vistas derivadas sin duplicación.
5. Completar y reabrir una tarea manteniendo `completedAt` coherente.
6. Crear una reunión, gestionar participantes y editar notas detectando conflictos de revisión.
7. Subir y descargar un documento sin exponer la ruta física del servidor.
8. Generar notificaciones y recordatorios persistentes sin duplicados.
9. Suspender un usuario y bloquear inmediatamente todas sus sesiones.
10. Consultar actividad de proyecto y auditoría administrativa según permisos.
11. Instalar la PWA y usar las funciones principales en tamaños desktop, tablet y móvil.

## Requisitos no funcionales

- TypeScript estricto en frontend, backend y contratos compartidos.
- Accesibilidad objetivo WCAG 2.2 AA para flujos principales.
- Estados de carga, vacío y error explícitos; las operaciones críticas requieren confirmación.
- Operaciones de escritura consistentes y transaccionales cuando cambian varias entidades.
- Logs estructurados con identificador de petición y sin secretos.
- Backups recuperables de PostgreSQL y archivos persistentes.
- API documentada mediante OpenAPI y versionada bajo `/api/v1`.

## Fuera de alcance de V1

- Multi-tenancy y múltiples organizaciones.
- Aplicación móvil nativa.
- Microservicios.
- Colaboración de texto en tiempo real.
- Gantt avanzado y planificación de capacidad.
- Subtareas, dependencias, story points, prioridades, tags y workflows configurables.
- Almacenamiento S3/R2/MinIO activo y versionado complejo de archivos.
- Redis, BullMQ o escalado horizontal del scheduler.
- Offline-first y sincronización de mutaciones sin conexión.
- Contabilidad, facturación, CRM, nómina, inventario y soporte externo.
