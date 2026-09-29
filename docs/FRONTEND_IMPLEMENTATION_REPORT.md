# Informe de implementación del frontend V1

> **Documento histórico de la rama `ai/frontend`.** Varias de sus limitaciones (permisos, perfiles,
> dashboard, subida) se resolvieron en la integración; el estado vigente está en
> [FINAL_V1_REPORT.md](./FINAL_V1_REPORT.md) y [FRONTEND_BACKEND_GAPS.md](./FRONTEND_BACKEND_GAPS.md).

Rama `ai/frontend`, `apps/web`. No se modificó `apps/api/**`: todo lo que el
backend no ofrece está en [FRONTEND_BACKEND_GAPS.md](./FRONTEND_BACKEND_GAPS.md)
con su solución alternativa y el arreglo sugerido.

## Estado

El alcance funcional de `docs/PRODUCT.md` y `docs/UI-UX.md` está implementado
sobre los contratos reales de la API, con las excepciones de la sección
[Lo que no está hecho](#lo-que-no-está-hecho-o-no-se-ha-podido-comprobar).
Lo más importante a saber antes de darlo por cerrado:

- **Nunca se ha ejecutado contra un backend ni un navegador reales.** Se ha
  verificado con tipos, lint, tests unitarios y de componente (jsdom), build y
  una sonda HTTP de los ficheros PWA. Falta una pasada manual/E2E (ver abajo).
- **El backend no implementa `GET /dashboard`**, la actividad no tiene feed
  entre proyectos y los perfiles devuelven listas vacías. El dashboard y los
  perfiles se construyen con endpoints existentes; los detalles están en el
  documento de gaps.

## Bloques y commits

| Bloque | Commit | Contenido |
|---|---|---|
| Base, auth, shell | `90eceb0` | Layout, cliente API, login/refresh/sesiones |
| Usuarios y RBAC | `2ec4e28` | Invitaciones, roles, perfiles, auditoría |
| Proyectos | `49815fd` | Listado, detalle, miembros |
| Tareas | `bf7992b` | Lista, alta/edición, completar/reabrir, baja |
| **Schedule** | `f9b8b2c` | Cronograma y calendario de proyecto, Mi cronograma |
| **Reuniones** | `8e915cd` | CRUD, participantes, notas Tiptap, conflictos de revisión |
| **Documentos** | `d8e3a4b` | Subida, listado, descarga, baja |
| **Notificaciones** | `b24cdd7` | Campana, contador, historial, navegación |
| **Dashboard / actividad / perfiles** | `5674f09` | Dashboard, pestaña Actividad, perfiles |
| Auditoría (completada) | `ff809e6` | Fechas, paginación, actor legible |
| **PWA** | `4a30945` | Iconos, service worker, actualización, instalación, conexión |
| Tests de componente | `9bd142e` | jsdom + Testing Library; corrige un bug de borrador |
| Arreglo de tareas | `c6da9b1` | Tareas terminadas visibles, filtro de fechas, paginación |

## Qué hace cada bloque nuevo

**Schedule.** Cronograma por proyecto como barras por día (HTML/CSS propio, sin
Gantt) con lista alternativa accesible; en móvil abre por defecto en lista.
Calendario de proyecto y Mi cronograma con FullCalendar 6 (locale `es`), con un
icono y texto accesible por tipo y estado además del color; las tareas `DONE`
van atenuadas, con check y tachadas; las reuniones son bloques distintos. El
calendario **se mantiene montado mientras carga** para conservar el mes visible.
Mi cronograma guarda filtros, vista y mes en la URL y agrupa por el día
**local** del usuario.

**Reuniones.** Lista (próximas/pasadas/todas, búsqueda, paginación), un único
detalle (`?meetingId=`) compartido con el calendario, formulario con horas
locales convertidas a UTC y participantes limitados a miembros. Notas con
Tiptap 3 (encabezados, negrita, cursiva, listas, checklist, enlace) y guardado
explícito. Ante `REVISION_CONFLICT` el borrador nunca se pierde, el guardado
queda bloqueado, **no hay botón de sobrescritura**, y "recargar la última
versión" deja el borrador anterior aparte, de solo lectura y copiable.

**Documentos.** Zona de subida accesible, límites visibles antes de enviar,
progreso y error por archivo sin frenar a los demás, reintento, éxito solo tras
confirmación del backend, descarga por el endpoint autorizado (blob con el
bearer) y baja con confirmación.

**Notificaciones.** Campana con contador, popover que se refresca al abrirse,
"marcar todas", historial con filtros y paginación, e ítem compartido con icono,
proyecto y tiempo.

**Dashboard, actividad, perfiles.** Cinco bloques independientes (un fallo solo
afecta a su bloque), pestaña Actividad con filtros y texto compuesto por tipo
de evento, perfil propio con datos reales y perfil ajeno honesto sobre lo que
el servidor aún no informa.

**PWA.** Manifest con iconos reales (faltaban los PNG), service worker
registrado y basado en *prompt* (el usuario decide cuándo recargar; ningún
formulario se pierde solo), tarjeta de instalación descartable (silencio de 30
días), banner de conexión (sin red, o API inalcanzable con reintento) y áreas
seguras en móvil. Solo se precachea el shell: **no hay caché en runtime** y
`/api/` está excluido, así que nada autenticado ni ningún documento se cachea.
Carga diferida por rutas (JS inicial de 1,15 MB a 650 KB) y pantalla de error
de ruta que ofrece recargar cuando un chunk de un despliegue anterior ya no
existe.

## Bugs reales encontrados y corregidos

Detectados al verificar contra el backend real o al montar los componentes;
varios estaban en bloques anteriores.

1. **Fechas de calendario un día antes** (proyectos y tareas). `new Date('…T00:00:00Z')`
   se muestra como el día anterior en zonas UTC−. Nuevo `lib/dates.ts` y tests
   con la zona fijada a UTC−5.
2. **"Atrasada" el mismo día del vencimiento**, por comparar contra un instante
   UTC en lugar del día local.
3. **Tareas terminadas ocultas** bajo el filtro "Todos": la API las excluye si no
   se pide `includeCompleted`, contra `PRODUCT.md`.
4. **Borrador perdido tras un conflicto de notas** (el "borrador anterior" guardaba
   la versión ajena). Lo encontró el primer test de componente.
5. **El calendario, tal como estaba sin commitear, se desmontaba durante la carga**
   y por diseño habría vuelto al mes actual al navegar. Se detectó leyendo el
   código, no se llegó a reproducir en un navegador.
6. **Tarjetas de Equipo y Proyectos solo con ratón** (`Card` con `onClick`): ahora enlaces reales.
7. **La PWA no era instalable**: iconos inexistentes, sin registro del service worker.
8. **Auditoría**: solo veía los primeros 50 eventos y pedía un UUID a mano.
9. La hoja de detalle de tarea ofrecía "Reintentar" ante un 404.

## Verificación realizada

- `pnpm verify` (raíz): **exit 0** — lint, typecheck, test y build de `shared`,
  `api` y `web`. Lint web: 0 errores y 3 avisos de `react-hook-form`
  (`react-hooks/incompatible-library`) que ya existían.
- Tests web: **84 en 18 ficheros** (más 327 de la API). Lógica pura (fechas,
  agrupación, actividad, dashboard, perfiles, subidas, PWA) y componentes en
  jsdom: `NotesEditSession` (conflictos), `CalendarView`, `useDocumentUploads`,
  `MeetingFormDialog`, `ProjectTasksPage`.
- Build de producción servido con `vite preview`: manifest, `sw.js`, los tres
  iconos, `apple-touch-icon` y el fallback SPA responden con el tipo correcto; el
  service worker solo hace `skipWaiting` ante el mensaje del usuario y excluye `/api/`.

## Lo que no está hecho o no se ha podido comprobar

- **Sin verificación en navegador**: maquetación, responsive a 360 px, contraste
  real, foco y lectores de pantalla, la instalación efectiva de la PWA y el
  comportamiento de FullCalendar/Tiptap con datos reales. jsdom no mide layout.
  Recomendado antes de dar el V1 por bueno: recorrer los flujos de aceptación 3–6
  y 10–11 de `PRODUCT.md` con el backend levantado.
- **Web Push**: no se implementa; el backend no tiene endpoints de suscripción
  (opcional en el producto).
- **Roles visibles** (insignias en Equipo, perfil, admin): imposible hasta que
  el backend los devuelva. La navegación de administración solo se muestra al
  Owner porque `/auth/me` no expone permisos.
- **Sin drag-and-drop** ni edición de fechas desde el calendario, a propósito
  (`UI-UX.md`).
- **Bundle**: el chunk principal sigue en ~650 KB (React Query, Radix, etc.); el
  editor de notas (~406 KB) y FullCalendar (~264 KB) cargan bajo demanda, pero el
  service worker precachea todo (1,6 MB) en la primera visita.
- El aviso de "nueva versión" avisa, pero no sabe si hay un formulario a medias:
  la protección es que la recarga siempre la decide el usuario.

## Cómo probarlo

```bash
pnpm install
pnpm verify                      # lint + typecheck + test + build de todo el workspace
pnpm --filter web test           # solo los tests del frontend
pnpm --filter web dev            # desarrollo (API en VITE_API_BASE_URL)
pnpm --filter web build && pnpm --filter web preview   # PWA (el service worker solo actúa en build)
```

Variables `VITE_*` opcionales en `apps/web/.env.example`: además de
`VITE_API_BASE_URL`, `VITE_MAX_UPLOAD_BYTES` y `VITE_DOCUMENT_ALLOWED_EXTENSIONS`
deben reflejar `MAX_UPLOAD_BYTES` y `DOCUMENT_ALLOWED_EXTENSIONS` del backend
(solo dan aviso temprano; el servidor manda).

Los iconos PWA (`public/icons/*.png`, `apple-touch-icon.png`) se rasterizaron a
partir de `public/favicon.svg` (monograma "E" sobre el verde de marca; la
variante *maskable* va a sangre completa). Si se rediseña la marca hay que
regenerarlos.

## Decisiones de diseño que conviene conocer

- **Fechas**: las de calendario (`startDate`, `dueDate`) son días sin zona y las
  reuniones son instantes que se muestran en la zona del usuario, con su etiqueta.
  Todo pasa por `lib/dates.ts`; nunca `new Date(valor)` para mostrar un día.
- **Autorización**: el frontend solo oculta acciones con lo que sabe (Owner,
  rol local del proyecto, `viewerCapabilities` de cada recurso); cualquier
  `403`/`404` del servidor se gestiona con un estado seguro.
- **Estado en la URL**: filtros, vista, página y el detalle abierto viven en
  query params, así "volver" conserva el contexto.
- **Dependencias añadidas**: `workbox-window` (necesaria para registrar el
  service worker) y, solo de desarrollo, `vitest`, `jsdom` y
  `@testing-library/*`. No se añadió ninguna otra librería de runtime.
