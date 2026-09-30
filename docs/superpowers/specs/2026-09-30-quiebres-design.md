# Módulo de quiebres — Design Spec

**Fecha:** 2026-09-30
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## Contexto

Un quiebre es el momento en que un sabor (PT) no tiene nada para ofrecer: no queda bacha exhibida con stock **y** tampoco hay ninguna bacha de repuesto esperando en el obrador. Hoy el sistema no registra esto en ningún lado — se pierde la información de cuándo pasó y cuánto tardó en resolverse.

El sistema no tiene POS ni ningún evento que indique "se vendió la última porción" — la única forma de saber que un sabor se quedó sin nada es que una persona lo reporte. Este módulo existe para capturar ese reporte de forma ágil y, a partir de ahí, cerrar el ciclo automáticamente cuando el sabor vuelve a estar disponible.

## Qué significa "0 stock" en este sistema (importante)

`v_stock_pt_vivo` (la vista que ya usa PCP para "stock actual") representa la **última bacha exhibida** de cada posición, con su cantidad original completa — el sistema nunca decrementa esa cantidad a medida que se vende, porque no hay forma de detectarlo automáticamente. Por lo tanto, `v_stock_pt_vivo` **no sirve** para decidir si un sabor está realmente en 0 ahora mismo: puede mostrar `cantidad = 4.36` para un sabor cuya vitrina está, en la realidad, completamente vacía.

Lo único que el sistema puede calcular con certeza es si hay **stock de respaldo esperando** para ese sabor: bachas fabricadas y todavía sin exhibir (`listPartidasEnObrador`, lo mismo que ya usa el módulo Exhibir). Si esa lista está vacía para un sabor, no hay con qué reponerlo si se termina — ahí es donde tiene sentido habilitar la carga de un quiebre. Si el sabor exhibido se terminó de verdad es, precisamente, el hecho que la persona está reportando al cargar el formulario.

**Definición operativa usada en este spec:** un sabor es "elegible" para cargar un quiebre cuando no tiene bachas pendientes de exhibir (`listPartidasEnObrador` vacío para ese `id_prod`). Si tiene bachas pendientes, se muestra advertencia pero se permite cargar igual (por si la persona sabe que esas bachas no alcanzan o hay un motivo válido).

## Modelo de datos

Nueva tabla `malaga.f_quiebres`:

| Columna | Tipo | Notas |
|---|---|---|
| `id_quiebre` | serial PK | |
| `id_prod` | int, FK `d_productos` | Solo PT |
| `ts_carga` | timestamptz | `now()` al insertar, no editable |
| `ts_quiebre_real` | timestamptz | Tipeado por la persona, puede ser anterior a `ts_carga` |
| `user_carga` | int, FK `usuarios` | |
| `ts_repuesto` | timestamptz, nullable | `NULL` = abierto |
| `id_partida_repuso` | int, FK `f_partidas_stock`, nullable | Qué bacha lo resolvió |

Un quiebre "abierto" es uno con `ts_repuesto IS NULL`. Constraint a nivel aplicación (no UNIQUE parcial en DB, para no over-engineer): no se permite insertar un quiebre nuevo para un `id_prod` que ya tiene uno abierto.

## Flujo: cargar un quiebre

Página nueva `/quiebres`, con entrada propia en la navegación.

- Selector de sabor: lista productos PT elegibles (sin bachas pendientes) primero; el resto de los PT también aparece, pero seleccionarlos dispara una advertencia no bloqueante ("Este sabor todavía tiene bachas esperando para exhibir — ¿seguro que es un quiebre?"), igual que el patrón ya usado en "Nueva orden de producción".
- Si el sabor elegido ya tiene un quiebre abierto: **se bloquea la carga** (único caso de bloqueo duro en todo el sistema, por decisión explícita del usuario) y se muestra el quiebre existente (hace cuánto está abierto, quién lo cargó) en vez de dejar crear uno nuevo.
- Campo: fecha/hora real del quiebre (`datetime-local`, default "ahora", editable).
- Al confirmar: inserta con `ts_carga = now()`, `user_carga` = usuario de sesión.

## Flujo: reposición automática

Se engancha en `exhibirPartida` (`src/lib/exhibidora/queries.ts`): al exhibir una bacha, si el producto de esa bacha tiene un quiebre abierto, se cierra en la misma operación — `ts_repuesto = now()`, `id_partida_repuso = id_partida` recién exhibida. El tiempo de resolución que se reporta es `ts_repuesto - ts_quiebre_real` (la hora real del quiebre, no la de carga), porque es la métrica que le importa al negocio: cuánto tiempo estuvo el sabor realmente sin ofrecerse.

## Vistas

- **Quiebres abiertos**: sabor, hace cuánto tiempo (calculado desde `ts_quiebre_real`), quién lo cargó. Vive en `/quiebres` junto al formulario de carga.
- **Historial de quiebres resueltos**: sabor, cuándo se abrió, cuándo se resolvió, tiempo total. Esto alimenta directamente el futuro módulo de análisis ("análisis de quiebres").

No se agrega opción de "deshacer" un quiebre en Auditoría por ahora — se puede sumar más adelante si hace falta, siguiendo el mismo patrón que las demás secciones (`deshacerExhibicion`, `cancelarOrden`, etc.), pero no estaba pedido y se deja fuera para no ampliar el alcance sin necesidad.

## Fuera de alcance

- No hay forma de registrar manualmente que un quiebre se resolvió sin pasar por Exhibir — es intencional, para que el dato de reposición siempre venga de un evento real del sistema.
- No se modela más de un quiebre simultáneo por sabor (bloqueado explícitamente).
- No se toca nada de SEMI/bases — los quiebres aplican solo a PT, que es lo que se exhibe al cliente.

## Testing

- Elegibilidad (bachas pendientes = 0) y bloqueo por duplicado.
- Cierre automático dentro de `exhibirPartida`, incluyendo el caso sin quiebre abierto (no debe hacer nada extra).
- Cálculo de tiempo de resolución sobre `ts_quiebre_real`, no sobre `ts_carga`.
