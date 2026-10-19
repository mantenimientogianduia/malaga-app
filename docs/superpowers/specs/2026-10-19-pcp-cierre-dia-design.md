# PCP: cierre del día (fabricación, descongelado y cocción) — Design Spec

**Fecha:** 2026-10-19
**Estado:** Diseño aprobado por el usuario, pendiente de revisión de la spec escrita y plan de implementación.
**Reemplaza:** la pestaña "Plan" de `/pcp` definida en `2026-08-05-pcp-module-design.md` (pronóstico por regresión). Esa spec sigue vigente para la pestaña Estadísticas. La pantalla de factores por día/producto queda sin uso en el plan nuevo (no se borra).

## 1. Contexto y problema

El PCP actual (`/pcp`) calcula el plan de mañana con una regresión sobre el historial de exhibiciones y cuenta la bacha exhibida como si estuviera siempre al 100%. Pero al exhibir una bacha el sistema solo sabe que pasó a la exhibidora, no cuánto queda: al cierre solo se conoce con certeza el stock de producto terminado **sin exhibir**. Una bacha exhibida casi vacía o casi llena cambia cuánto hay que fabricar.

Además, el plan actual no distingue cómo funcionan las bases: las bachas se fabrican "justo a tiempo" (lead time mínimo), mientras que las bases se cocinan por lote óptimo (con un lote mínimo) y se guardan en stock; para fabricar hay que descongelar la cantidad que se va a usar.

Esta spec define un **cierre del día** en el que el usuario confirma el stock real y, a partir de eso, el sistema entrega tres listas para el día siguiente: **qué fabricar (bachas), qué descongelar (bases) y qué cocinar (bases)**.

## 2. Pantalla de cierre del día

Una sola página en `/pcp` (pestaña "Cierre del día", reemplaza a "Plan"), con cuatro bloques y un resultado que se recalcula al cambiar cualquier dato:

1. **Bachas del obrador** (PT sin exhibir). Se listan las bachas que el sistema tiene sin exhibir y sin baja (producto, lote, kg). El usuario destilda las que no estén físicamente; al confirmar, esas partidas quedan con baja manual motivo `ajuste`.
2. **Bachas exhibidas.** Una fila por cada bacha actualmente exhibida (la última partida exhibida de cada posición de la exhibidora) con botones **0, 25, 50, 75, 100%**. Es obligatorio elegir un valor en cada fila para poder confirmar.
3. **Bases.** Una fila por base (SEMI) con el stock **teórico** del sistema, un campo para el stock **real** (un único total, sin distinguir congelado de descongelado) y la diferencia (real − teórico). El campo es obligatorio.
4. **Resultado de mañana:** tres tablas editables antes de confirmar (ver sección 3).

Al confirmar (un solo botón) se hace todo en una transacción: bajas por ajuste, creación de las OPs de fabricación y de cocción con `fecha_plan` = mañana, y se guarda el cierre completo (sección 5).

Roles con acceso: `gestion`, `admin`, `produccion` (hoy `/pcp` es solo gestión/admin; la pestaña Estadísticas sigue restringida a gestión/admin).

## 3. Cálculo

Sabores considerados: los de la cartilla actual y los programados para entrar (misma lista que usa hoy `getProductosEnCartilla`).

### 3.1 Fabricar (bachas)

```
demanda_mañana(sabor) = demanda_base_kg_dia(sabor) × (1 + margen_pct/100)

stock_disponible(sabor) = kg en obrador sin exhibir (tras destildar)
                          + kg de la bacha exhibida × (pct_bacha / 100)

necesario(sabor) = demanda_mañana − stock_disponible − cocciones_pendientes(sabor)

kg_a_fabricar = necesario > 0 ? ceil(necesario / peso_estandar) × peso_estandar : 0
bachas        = kg_a_fabricar / peso_estandar
```

- La demanda es la misma todos los días de la semana (decisión del usuario: la variación por día de la semana ya no es real). No se usa `pcp_factor_dia_semana`.
- `cocciones_pendientes` (para PT: OPs de fabricación pendientes) = suma de `cant_plan` de OPs de ese producto en estado `planificada` o `en_proceso`, como hoy.
- Si un sabor no tiene `peso_estandar`, no se redondea a bacha (se usa `lote_optimo`/`lote_minimo` si existen, y si no, los kg exactos) y se marca la fila.
- El stock mínimo de la ficha **no se usa** en este cálculo (el margen cumple esa función).
- Un sabor sin demanda base cargada tiene demanda 0 y se marca la fila con aviso.
- Las bachas se pueden editar antes de confirmar.

### 3.2 Descongelar (bases)

Para cada base, lo que consume el plan de fabricación, usando la misma explosión de recetas que ya existe (`cant_subprod × kg_a_fabricar` de cada sabor cuya receta activa usa esa base; a verificar en el plan que la unidad de `cant_subprod` es por kg de PT, como asume `calcularPlanManana` hoy):

```
necesidad_fabricacion(base) = Σ sabores ( cant_subprod × kg_a_fabricar(sabor) )
descongelar(base)           = min(necesidad_fabricacion, stock_real(base))
faltante(base)              = max(necesidad_fabricacion − stock_real(base), 0)
```

Si hay `faltante` se muestra un aviso rojo en la fila. Descongelar **no genera OP**: es una instrucción para el equipo, y se guarda en el cierre.

### 3.3 Cocinar (bases)

```
consumo_diario_proyectado(base) = Σ sabores ( cant_subprod × demanda_base_kg_dia(sabor) × (1 + margen_pct/100) )
                                  (igual que la demanda de mañana: no hay variación por día)

stock_tras_mañana(base) = stock_real − descongelar

objetivo(base)  = consumo_diario_proyectado × dias_cobertura
a_reponer(base) = objetivo + faltante − stock_tras_mañana − cocciones_pendientes(base)

kg_a_cocinar = a_reponer > 0 ? max( ceil(a_reponer / lote_optimo) × lote_optimo, lote_minimo ) : 0
```

- `dias_cobertura` es **un único valor global** (por ejemplo 3).
- `cocciones_pendientes(base)` = OPs de la base en estado `planificada`/`en_proceso`.
- `lote_optimo` y `lote_minimo` son los campos ya existentes en la ficha de la base; si son nulos se aplica la lógica actual de `calcularCantidadAPlanificar` (sin redondeo / sin mínimo).
- El `faltante` se suma al objetivo para que la cocción cubra también lo que mañana no alcanzó.
- Las cantidades de cocción se pueden editar antes de confirmar.
- El stock mínimo de la ficha tampoco se usa para bases en este flujo.

## 4. Stock teórico de las bases

```
teorico(base) = real_cierre_anterior(base)
              + Σ cantidad de partidas SEMI ingresadas desde el cierre anterior (OPs de cocción finalizadas)
              − Σ cant_subprod consumida por OPs de fabricación finalizadas desde el cierre anterior
              − Σ restante de partidas SEMI dadas de baja manual desde el cierre anterior
```

- "Desde el cierre anterior" = posterior al `ts_cierre` del último cierre que tenga esa base.
- Si la base nunca tuvo cierre, `teorico` = suma de `restante` de `v_stock_semi_vivo` (stock actual por lotes).
- La diferencia `real − teorico` se guarda por base y por cierre, para ver cuánto se desvía el sistema de la realidad.
- El stock real **no corrige** los lotes de la pantalla Stock: los lotes quedan para trazabilidad y el plan usa el real declarado. Corregir lotes (FIFO) queda fuera de alcance.

## 5. Datos nuevos

```sql
-- Demanda manual por sabor
malaga.pcp_demanda_base (
  id_prod INTEGER PRIMARY KEY REFERENCES malaga.d_productos(id_prod),
  kg_dia NUMERIC(12,3) NOT NULL CHECK (kg_dia >= 0)
)

-- Configuración global de una sola fila (id = 1)
malaga.pcp_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  margen_pct NUMERIC(6,2) NOT NULL DEFAULT 20,
  dias_cobertura NUMERIC(6,2) NOT NULL DEFAULT 3
)

-- Un cierre del día
malaga.f_cierre_dia (
  id_cierre SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,              -- día cerrado
  fecha_plan DATE NOT NULL,         -- día para el que se planifica (mañana)
  ts_cierre TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_cierre INTEGER NOT NULL REFERENCES malaga.usuarios(id_user),
  margen_pct NUMERIC(6,2) NOT NULL,
  dias_cobertura NUMERIC(6,2) NOT NULL
)

-- % de cada bacha exhibida
malaga.f_cierre_dia_bacha (
  id_cierre INTEGER NOT NULL REFERENCES malaga.f_cierre_dia(id_cierre),
  id_partistock INTEGER NOT NULL REFERENCES malaga.f_partidas_stock(id_partistock),
  pct SMALLINT NOT NULL CHECK (pct IN (0, 25, 50, 75, 100)),
  PRIMARY KEY (id_cierre, id_partistock)
)

-- Stock de bases y resultado por base
malaga.f_cierre_dia_base (
  id_cierre INTEGER NOT NULL REFERENCES malaga.f_cierre_dia(id_cierre),
  id_prod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
  stock_teorico NUMERIC(12,3) NOT NULL,
  stock_real NUMERIC(12,3) NOT NULL CHECK (stock_real >= 0),
  descongelar NUMERIC(12,3) NOT NULL,
  faltante NUMERIC(12,3) NOT NULL,
  cocinar NUMERIC(12,3) NOT NULL,
  PRIMARY KEY (id_cierre, id_prod)
)
```

- El snapshot del cálculo por producto sigue yendo a `f_pcp_pronostico` (tabla existente; una fila por sabor y por base con cantidad planificada y `id_op_generada`). `stock_actual_momento` = `stock_disponible` (PT) o `stock_real` (base).
- `margen_pct` y `dias_cobertura` se copian al cierre para poder auditar con qué valores se calculó.
- Se pueden hacer varios cierres el mismo día: las OPs ya creadas cuentan como pendientes y no se duplican; para "teórico" y "cierre anterior" vale el último cierre.
- Pantalla de configuración (kg/día por sabor, margen, días de cobertura) nueva, en `/pcp` (pestaña "Configuración"), solo gestión/admin.

## 6. Pantalla "Plan del día"

Vista de solo lectura del último cierre confirmado cuyo `fecha_plan` es hoy, con las tres listas (fabricar, descongelar, cocinar). Es lo que mira el equipo a la mañana siguiente, incluido el descongelado, que no tiene OP.

## 7. Casos borde

- Sabor en cartilla sin bacha exhibida en este momento: no hay fila de % y su `stock_disponible` es solo el del obrador.
- Base que no está en ninguna receta de la cartilla: aparece en el bloque de stock (para contar y registrar la diferencia) pero su consumo proyectado es 0 y no se planifica cocción.
- Base sin cierre previo: ver sección 4.
- Mañana es un día atípico (feriado, cierre del local): no hay factor por día; las cantidades de bachas y de cocción se editan a mano antes de confirmar.
- El cierre exige haber elegido el % de todas las bachas exhibidas y cargado el stock real de todas las bases.

## 8. Fuera de alcance

- Corregir automáticamente los lotes de Stock con el stock real.
- Demanda automática desde historial (queda el cálculo por regresión en `src/lib/pcp/`, sin uso en el plan, y el historial de % del cierre para hacerlo más adelante).
- Clima en la fórmula, factores por día o por producto, días de cobertura por base.
- Registrar el descongelado como movimiento de stock.

## 9. Testing

- Funciones puras (fabricar, descongelar, cocinar) con tests unitarios: casos 0%/100% de bacha, redondeo a bachas enteras, sabor sin `peso_estandar`, faltante de base, lote mínimo, cocciones pendientes.
- Stock teórico de bases contra la base de datos: con y sin cierre previo, producción, consumo y bajas manuales.
- Cierre completo contra la base: crea OPs de fabricación y cocción, guarda `f_cierre_dia*`, y un segundo cierre el mismo día no duplica OPs.
- Bajas por ajuste de bachas del obrador destildadas.
- Verificación manual en el navegador del flujo completo y del control de roles.
