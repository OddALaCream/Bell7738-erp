# UI/UX

## Objetivo

La V1 debe sentirse como una herramienta interna clara y rápida, no como un ERP pesado. La misma aplicación web responsive cubre escritorio, tablet y móvil y puede instalarse como PWA.

La interfaz nunca sustituye autorización backend. Ocultar o deshabilitar una acción evita frustración, pero cualquier `403` o `404` del servidor se maneja correctamente porque permisos y membresías pueden cambiar mientras la pantalla está abierta.

## Principios

- Priorizar el trabajo del usuario: tareas, reuniones y proyectos antes que configuración.
- Mantener navegación y acciones consistentes entre vistas.
- Mostrar estado, responsable y fechas sin depender sólo de color.
- Usar revelado progresivo: filtros frecuentes visibles, opciones avanzadas dentro de una superficie secundaria.
- Diseñar primero estados vacíos, carga, error y permisos insuficientes, no sólo el caso exitoso.
- Confirmar operaciones destructivas y explicar sus consecuencias.
- Conservar contexto al abrir detalles desde calendario o cronograma.
- Evitar densidad y patrones visuales de Discord; sólo se toma la idea de avatares y badges de roles legibles.

## Sistema visual

- Tailwind CSS para tokens y composición.
- shadcn/ui como base accesible y adaptable, sin copiar demos sin criterio.
- Lucide con icono acompañado de label o nombre accesible cuando la acción no sea obvia.
- Tipografía sans-serif de sistema o una fuente web explícitamente aprobada.
- Espaciado y radios coherentes, contraste WCAG 2.2 AA.
- Tema claro como mínimo; tema oscuro puede añadirse si no retrasa flujos centrales.

Estados usan icono, texto y color:

- proyectos: planned, active, paused, completed, cancelled;
- tareas: pending, in progress, done;
- usuarios: invited, active, suspended, disabled.

Los colores de roles son personalizables, pero el texto del rol siempre permanece visible y el componente ajusta borde/fondo para conservar contraste.

## Estructura de navegación

### Rutas públicas

- `/login`
- `/invitations/accept`

### Aplicación autenticada

- `/` — Dashboard.
- `/schedule` — Mi cronograma.
- `/projects` — Proyectos.
- `/projects/:projectId/overview`
- `/projects/:projectId/tasks`
- `/projects/:projectId/timeline`
- `/projects/:projectId/calendar`
- `/projects/:projectId/meetings`
- `/projects/:projectId/documents`
- `/projects/:projectId/members`
- `/projects/:projectId/activity`
- `/team` — Equipo.
- `/profile` — Perfil propio.
- `/profile/sessions` — Sesiones propias.
- `/users/:userId/profile` — Perfil interno visible.
- `/notifications` — Historial de notificaciones.

### Administración

- `/admin/users`
- `/admin/roles`
- `/admin/audit`

Navegación y rutas administrativas se muestran según capacidades conocidas, pero el loader o consulta de cada ruta acepta la decisión final de la API.

## Layout responsive

### Escritorio

- Sidebar persistente con navegación principal.
- Header con breadcrumb, búsqueda contextual cuando aplique, campana y menú de perfil.
- Contenido con ancho máximo apropiado; calendarios y cronograma pueden usar todo el ancho.
- Detalles rápidos en drawer lateral para no perder filtros o posición.

### Tablet

- Sidebar colapsable.
- Tablas adaptadas con columnas secundarias ocultables.
- Drawers de mayor ancho o modal según contenido.

### Móvil

- Navegación principal compacta, con drawer o barra inferior para destinos frecuentes.
- Acciones primarias visibles y targets táctiles mínimos de 44 × 44 px.
- Tablas convertidas en cards/listas, sin scroll horizontal como única solución.
- Detalles en pantalla completa o bottom sheet; formularios largos en página dedicada.
- Calendario con vista agenda/lista disponible cuando la cuadrícula mensual sea demasiado densa.

Los breakpoints se eligen por comportamiento del contenido, no por modelos de dispositivo.

## Autenticación e invitaciones

### Login

- Email y contraseña.
- Botón con estado de envío y prevención de doble submit.
- Mensaje genérico para credenciales o cuenta no disponibles.
- No mostrar si un email existe.
- Tras login, volver a la ruta segura solicitada o al dashboard.

### Recuperación de sesión

Al cargar la app, mostrar un estado breve de restauración mientras se intenta refresh. No renderizar durante ese instante datos de un usuario anterior. Si refresh falla, limpiar estado y dirigir a login.

### Aceptación de invitación

- Leer token del fragmento o enlace sin registrarlo.
- Mostrar identidad invitada sólo después de validar el token.
- Formulario de contraseña y confirmación.
- Explicar token expirado, usado o revocado con un mensaje seguro y una vía para contactar al administrador.
- Tras aceptar, dirigir a login.

## Dashboard

Orden recomendado:

1. Mis tareas, priorizando vencidas y próximas por fecha.
2. Próximas reuniones.
3. Mis proyectos activos.
4. Actividad reciente visible.
5. Equipo.

Cada bloque muestra una muestra acotada y un enlace “Ver todo”. No convertir el dashboard en otra pantalla de administración.

En móvil los bloques se apilan. Skeletons mantienen la forma; un fallo parcial muestra error sólo en el bloque afectado cuando sea seguro.

## Proyectos

### Listado

Controles:

- búsqueda por nombre o cliente;
- chips o tabs para activos, finalizados, pausados, próximos a terminar y atrasados;
- orden por creación, inicio o fin esperado;
- botón Crear proyecto sólo con capacidad.

Vista desktop en tabla o lista densa; móvil en cards. Cada elemento muestra nombre, cliente si existe, estado, fechas y miembros resumidos. Los filtros se reflejan en la URL para compartir y volver atrás sin perder contexto.

### Crear y editar

Formulario con nombre, descripción, cliente, estado y fechas. Validación inmediata de formato, pero errores del backend quedan junto al campo. Cambiar a completado explica que se registrará `completedAt`.

Eliminar es baja lógica y requiere diálogo con nombre del proyecto y explicación del impacto. Cancelar proyecto y eliminar no son sinónimos.

### Interior del proyecto

Header con nombre, estado, fechas y acciones permitidas. Tabs:

- Overview
- Tareas
- Cronograma
- Calendario
- Reuniones
- Documentos
- Miembros
- Actividad

En móvil, tabs con scroll horizontal o selector accesible. Las rutas conservan un tab por URL para navegación y deep links.

## Tareas

### Lista

Muestra estado, título, asignados, inicio y vencimiento. Filtros por estado, asignado y fechas. La tarea terminada permanece en la lista con menor opacidad, check y label `Done`/`Terminada`.

Acciones rápidas sólo si no ocultan reglas:

- completar para asignado/manager autorizado;
- abrir detalle;
- editar desde detalle.

No incluir prioridad, tags, story points, subtareas ni dependencias.

### Crear y editar

Campos: título, descripción opcional, inicio, vencimiento y uno o varios asignados. El selector sólo ofrece miembros activos del proyecto. No permitir guardar sin asignados ni con vencimiento anterior al inicio.

Completar y reabrir muestran feedback inmediato, pero cualquier optimistic update debe poder revertirse si la API deniega o falla.

### Detalle

Drawer en desktop y página/sheet en móvil. Incluye todos los datos, asignados y acciones. Abrir desde lista, calendario o cronograma utiliza la misma vista de detalle.

## Cronograma

Visualización sencilla, no Gantt avanzado:

- eje temporal por días/semanas;
- una fila por tarea;
- barra desde `startDate` hasta `dueDate`;
- título, avatares y estado;
- scroll horizontal controlado en rangos largos;
- alternativa de lista accesible.

Las tareas `DONE` tienen menor opacidad y check. Las atrasadas muestran texto/icono adicional. No hay drag-and-drop obligatorio en V1; editar fechas mediante formulario reduce errores y complejidad.

FullCalendar se usa para calendarios. El cronograma puede ser una composición HTML/CSS específica y pequeña; no se fuerza un Gantt empresarial ni una dependencia adicional.

## Calendarios

FullCalendar presenta tareas y reuniones como tipos distintos con leyenda visible.

- Tarea: evento de fecha, rango inclusivo presentado correctamente.
- Reunión: evento con hora y zona local.
- Click abre detalle reutilizable.
- Cambio de mes/semana actualiza el rango consultado.
- Vista lista disponible para accesibilidad y móvil.
- No habilitar drag-and-drop de edición hasta definir permisos, confirmación y manejo de zonas horarias.

El calendario de proyecto sólo muestra ese proyecto. Mi cronograma muestra únicamente relaciones del usuario autenticado.

## Mi cronograma

Controles:

- Todos, Tareas, Reuniones.
- Proyecto.
- Fecha/rango.
- Estado.
- Vista Calendario o Lista.

La lista cronológica agrupa por día y distingue claramente elementos pasados, próximos y terminados. Los filtros se guardan en query params, no en una configuración global innecesaria.

## Reuniones y notas

### Reuniones

Listado/calendario con título, proyecto, horario, organizador y participantes. Formulario con inicio y fin local, convertido a UTC al enviar. Mostrar zona horaria para evitar ambigüedad.

Los controles de participantes sólo aparecen al organizador, manager u override autorizado. Cambios significativos advierten que se notificará a participantes.

### Editor Tiptap

Toolbar mínima:

- párrafo y headings;
- negrita y cursiva;
- lista y lista numerada;
- checklist si su extensión es estable y sencilla;
- link.

Autosave no es necesario en V1. El usuario guarda explícitamente y ve estado guardando/guardado/error.

Ante `REVISION_CONFLICT`:

1. No descartar el borrador local.
2. Informar quién/cuándo modificó si la API dispone de esa información.
3. Ofrecer copiar el borrador, recargar la última versión y volver a aplicar cambios.
4. No mostrar un botón de sobrescritura ciega.

## Documentos

Listado con nombre, tipo, tamaño, uploader y fecha. Acciones según capacidad: descargar y eliminar; subir para autorizados.

Upload:

- selector y drop zone accesible;
- límites de tamaño/tipo visibles antes de enviar;
- progreso cuando sea fiable;
- error por archivo sin perder los demás;
- no presentar éxito hasta confirmación backend.

Eliminar requiere confirmación con el nombre. Descargar usa el endpoint autorizado, no una URL del volumen.

## Miembros, equipo y perfiles

### Miembros del proyecto

Lista con avatar, nombre y rol local. Managers autorizados pueden añadir, cambiar rol o retirar. El diálogo de retiro advierte sobre tareas o reuniones vigentes y protege al último manager.

### Equipo

Directorio con avatar o iniciales, nombre y badges de roles globales. Búsqueda sencilla. No mostrar email u otros datos más allá de la política interna definida.

### Perfil

- avatar o fallback de iniciales;
- nombre y email;
- roles con color y texto;
- proyectos activos y anteriores;
- tareas activas y terminadas;
- acceso a sesiones propias en el perfil propio.
- cambio de contraseña con confirmación de la contraseña actual.

En perfil ajeno, proyectos y tareas se filtran al scope del observador. Administradores autorizados pueden editar roles mediante una superficie explícita que resume permisos resultantes y evita auto-escalamiento.

## Administración

### Usuarios

Tabla/lista con búsqueda y filtros por estado/rol. Acciones separadas para editar, roles, suspender, reactivar y deshabilitar. Los controles del Owner están bloqueados con explicación, no simplemente ausentes.

Cambios de estado requieren confirmación e indican que se revocarán sesiones. No existe botón de borrado físico.

### Roles

Editor de nombre, descripción, color, posición y permisos agrupados por dominio. Mostrar un resumen de usuarios afectados antes de cambios amplios cuando sea práctico. El frontend no permite seleccionar permisos que el actor no puede conceder, y acepta la validación final del backend.

### Auditoría

Listado de sólo lectura con filtros por actor, acción, entidad y fecha. Detalle en drawer con metadata redactada. No hay editar ni borrar.

## Notificaciones

La campana del header muestra contador de no leídas y un popover con las recientes. Cada elemento incluye tipo, texto, tiempo y proyecto cuando aplique.

- Click marca leída y navega al recurso si sigue accesible.
- Un recurso eliminado muestra un estado histórico seguro.
- Acción “Marcar todas como leídas”.
- Página completa para historial y filtros.

Web Push se ofrece como configuración opcional. Rechazar o retirar permiso no produce banners persistentes ni rompe la campana interna.

## Estados comunes

### Carga

- Skeleton para estructura conocida.
- Spinner sólo para acciones locales breves.
- Botones deshabilitados durante submit para evitar duplicados.

### Vacío

Explicar por qué no hay datos y ofrecer la acción principal sólo si está permitida. Distinguir “sin resultados por filtros” de “aún no existe contenido”.

### Error

- Mensaje humano y requestId copiable para soporte.
- Reintento para fallos transitorios.
- Errores de campo junto al input.
- `401`: intentar un único refresh coordinado; si falla, login.
- `403/404`: retirar datos obsoletos de cache y mostrar estado seguro.
- No mostrar stack traces ni respuestas crudas.

### Confirmaciones

Requeridas para baja de proyecto/tarea/reunión/documento, suspensión, deshabilitación, revocación de sesiones ajenas permitidas y cambios amplios de roles. El texto usa el nombre del objeto y el efecto real.

## Accesibilidad

- HTML semántico y orden de headings.
- Navegación completa por teclado y foco visible.
- Focus trap y retorno de foco correctos en dialogs/drawers.
- Labels persistentes; placeholder no sustituye label.
- Mensajes de error asociados con `aria-describedby`.
- Cambios relevantes anunciados con live regions sin exceso.
- Contraste AA y estados no dependientes sólo de color.
- Calendario y cronograma con alternativa de lista.
- Editor con nombres accesibles y atajos documentados.
- Respetar `prefers-reduced-motion`.

## PWA y conectividad

- Manifest con nombre, iconos, colores y modo standalone.
- Prompt de instalación discreto y descartable.
- App shell disponible al reabrir, sin prometer datos offline.
- Banner de conexión cuando no sea posible consultar la API.
- No cachear documentos o respuestas autenticadas por defecto.
- Cuando haya una nueva versión del service worker, informar y permitir recargar sin perder formularios activos.

## Criterios de aceptación UX

- Los flujos principales son utilizables a 360 px y en escritorio.
- Volver desde detalle conserva filtros y posición razonablemente.
- Toda pantalla tiene loading, empty, error y forbidden/not-found seguros.
- Acciones no autorizadas no aparecen como disponibles y, si se invocan de todos modos, la UI maneja la denegación.
- Tareas y reuniones abren el mismo detalle desde sus diferentes vistas.
- Conflictos de notas nunca descartan el borrador local silenciosamente.
- La app sigue funcionando cuando instalación PWA, SMTP o Web Push no están disponibles.
