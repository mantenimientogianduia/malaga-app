# Rediseño del cambio de carta — Design Spec

**Fecha:** 2026-09-30
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## Contexto y problema

`malaga.d_exhibidora` tiene 24 posiciones. Cada una guarda `id_prod` (sabor actual), `id_prod_ant` (sabor anterior) e `id_prod_fut` + `ts_cambio_programado` (cambio a futuro programado).

Hoy el cambio se aplica **automáticamente por fecha**: la función `aplicarCambiosVencidos()` (`src/lib/exhibidora/queries.ts`), que corre cada vez que se lee la cartilla, hace `id_prod_ant = id_prod; id_prod = id_prod_fut; id_prod_fut = NULL` apenas se cumple `ts_cambio_programado`, sin ninguna relación con si todavía queda stock físico del sabor saliente.

Esto rompe en la práctica porque el cambio real nunca es instantáneo: se puede empezar a fabricar el sabor entrante mientras todavía queda stock (en el obrador o ya exhibido, sin reponer) del sabor saliente. Confirmado con el usuario: **nunca hay dos sabores exhibidos a la vez en una misma posición** — el problema es de secuenciación de stock/producción, no de exhibición simultánea.

Dos consecuencias concretas del modelo actual:
1. **Exhibir** (`src/app/(app)/exhibir/`) matchea bachas a posiciones por `e.id_prod = ps.id_prod` (posición actual únicamente). Apenas ocurre el flip automático, las bachas sin exhibir del sabor saliente dejan de matchear con ninguna posición (quedan "huérfanas" — ya visibles ahora en una sección separada en Exhibir, agregada como mitigación temporal, pero el problema de fondo sigue).
2. **PCP** (`getProductosEnCartilla` en `src/lib/pcp/queries.ts`) decide qué sabores planificar usando el mismo `id_prod` actual. Antes de la fecha de cambio no planifica el entrante (llega tarde); después del flip dejа de planificar el saliente aunque quede stock sin vender.

## Diseño aprobado

### 1. Eliminar el auto-flip por fecha

`aplicarCambiosVencidos()` se elimina. `ts_cambio_programado` pasa de ser un disparador automático a ser **solo una fecha orientativa** ("previsto para el 15/09") que se sigue mostrando en Cartilla actual, pero que no dispara ningún cambio de estado por sí sola.

### 2. Oficialización manual, enganchada a Exhibir

El flip real (`id_prod_ant = id_prod; id_prod = id_prod_fut; id_prod_fut = NULL; ts_ulticambio = now()`) ocurre **solo cuando una persona lo confirma explícitamente**, al exhibir una bacha del sabor saliente de una posición que tiene un `id_prod_fut` programado.

En la UI de Exhibir, al exhibir una bacha de un sabor que está en transición, se ofrece un checkbox opcional (sin marcar por defecto): **"Marcar como última bacha antes del cambio a [sabor entrante]"**. Si el sistema detecta que no quedan más bachas sin exhibir de ese sabor (mismo criterio que hoy usa `listPartidasEnObrador`), se muestra una pista visual junto al checkbox — pero la decisión la toma siempre la persona, porque el sistema no puede saber con certeza si queda stock físico sin cargar (ej. en el freezer, todavía no registrado).

Si se marca el checkbox, la acción de exhibir hace, en la misma transacción: (a) registrar la exhibición de la bacha como siempre, y (b) aplicar el flip de la posición.

### 3. Exhibir muestra saliente y entrante por separado en la misma posición

Mientras una posición tiene `id_prod_fut` programado (esté o no vencida la fecha), su tarjeta en Exhibir muestra dos bloques independientes:
- **Sabor actual** (`id_prod`): sus bachas pendientes de exhibir, igual que hoy — con el checkbox de "última bacha" si corresponde.
- **Sabor entrante** (`id_prod_fut`): sus bachas ya fabricadas y pendientes de exhibir (si las hay), exhibibles directamente a esa misma posición aunque el flip todavía no se haya oficializado — porque en la práctica se puede necesitar exhibir el entrante antes de que se confirme que el saliente ya terminó (ej. se agotó sin que nadie cargara el checkbox a tiempo).

Esto requiere que el matching de bachas a posiciones dependa de `id_prod` **o** `id_prod_fut` de la posición, no solo del actual.

### 4. PCP planifica el entrante desde que se programa el cambio

`getProductosEnCartilla()` pasa a incluir tanto `id_prod` como `id_prod_fut` (no nulo) de todas las posiciones — mismo criterio ya implementado para la advertencia de "Nueva orden de producción" (`listIdsEnCartillaOProgramados` en `src/lib/exhibidora/queries.ts`). Esto hace que PCP empiece a recomendar producción del sabor entrante desde que se programa el cambio, no recién después del flip.

### 5. Cartilla actual: ajustes de texto y acción manual opcional

- El texto "Cambia a [sabor] el [fecha]" se ajusta para dejar claro que la fecha es orientativa (ej. "Previsto: cambia a [sabor] (~15/09) — se oficializa al exhibir la última bacha del actual").
- Se agrega un botón manual **"Oficializar cambio ahora"** en el modal de la posición, para casos donde el flip no puede esperar al flujo normal de Exhibir (ej. corrección manual, error de carga). Aplica el mismo flip que el checkbox de Exhibir.

## Fuera de alcance

- No se modela "dos sabores exhibidos a la vez" en una posición — confirmado que nunca ocurre físicamente.
- No se cambia la lógica de cálculo de stock ni de consumo de recetas.
- No se toca `programarCambio`/`cancelarCambioProgramado` más allá de lo descrito (siguen sirviendo para fijar/cancelar el `id_prod_fut` + fecha orientativa).

## Testing

- Tests existentes de `aplicarCambiosVencidos` se eliminan junto con la función.
- Nuevos tests: matching de bachas a posición por `id_prod` o `id_prod_fut`; flip transaccional al exhibir con checkbox marcado; flip manual desde Cartilla actual; `getProductosEnCartilla` incluyendo `id_prod_fut`.
