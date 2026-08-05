# Módulo PCP (Planificación y Control de Producción) — Malaga Soft

- **Autor / dueño del producto:** Gino Pieretti
- **Fecha:** 2026-08-05
- **Estado:** Diseño aprobado, pendiente de plan de implementación

## 1. Resumen

Malaga Soft no tiene hoy ninguna noción de "cuánto vender vamos a tener mañana": la producción se decide a mano, o (hasta la sesión anterior) con un umbral simple de mínimo por sabor. Este módulo agrega un motor de pronóstico de demanda y traducción a cantidades de producción, tanto para los 24 sabores de la cartilla (PT) como para las bases que los componen (SEMI), y cierra el círculo generando las Órdenes de Producción del día siguiente en un solo paso, revisable antes de confirmar.

Como no existe (ni existió nunca) punto de venta en este sistema, la demanda se aproxima con la única señal real disponible: **la cantidad y frecuencia de lo que se va exhibiendo** (`ts_exhibicion` + `cantidad` de `f_partidas_stock`). Cada vez que se exhibe una bacha nueva es porque la anterior se agotó — el ritmo de exhibición es la mejor proxy de venta que tenemos.

El módulo se construye en dos fases con diseño conjunto pero implementación separada:
- **Fase 1** — el motor: pronóstico de demanda + traducción a cantidad a producir (PT y SEMI) + generación de OPs en lote.
- **Fase 2** — dashboard de estadísticas (tendencias, insights, clima) que además alimenta y hace visible los números que usa el motor de Fase 1.

**Explícitamente fuera de alcance de este spec:** la tabla de "quiebres" (registrar cuándo un sabor se queda sin bacha exhibida y cuándo se repone) — el usuario la mencionó como una idea a futuro, a profundizar en otra sesión. No se diseña ni se deja infraestructura específica para ella todavía, más allá de que el modelo de datos actual (`f_partidas_stock.ts_exhibicion`) no la bloquea.

## 2. Fase 1 — Motor de cálculo

### 2.1 Baseline de demanda semanal

Sobre las últimas 8 semanas de exhibiciones reales (todas las partidas de PT con `ts_exhibicion` no nulo, agrupadas por semana ISO), se suma el total de kg exhibidos por semana. Sobre esos 8 puntos se ajusta una regresión lineal simple (mínimos cuadrados) y se proyecta el valor de la semana siguiente. No hay modelos de series de tiempo más sofisticados en v1 — es la extensión mínima razonable sobre "promedio de las últimas N semanas" que el usuario pidió explícitamente.

### 2.2 Reparto por día de la semana y por producto

Del mismo histórico de 8 semanas se calculan dos distribuciones porcentuales:
- **% por día de la semana**: qué fracción del total semanal cayó en cada día (lunes a domingo), promediado sobre las 8 semanas.
- **% por producto**: qué fracción del total exhibido le corresponde a cada uno de los sabores actualmente en cartilla.

Ambas se recalculan solas cada vez que se genera un plan — no son config fija. Si un sabor lleva menos de 8 semanas en la cartilla (recién cambiado), su historial disponible es más corto; se usa el que haya (no se bloquea el cálculo por falta de historial completo).

### 2.3 Factores de ajuste

Tres mecanismos independientes para "inflar o desinflar" el cálculo:

- **Factor por día de la semana** (persistente, editable): multiplicador aplicado sobre el % de ese día, todas las semanas. Default 1.0.
- **Factor por producto** (persistente, editable): multiplicador aplicado sobre el % de ese producto, todas las semanas. Default 1.0.
- **Factor puntual de una semana** (no persistente): un multiplicador que se aplica una sola vez, en el momento de generar el plan de una semana en particular (ej. una ola de calor). No queda guardado como regla — es un ajuste manual del momento, que sí queda registrado en el snapshot histórico de esa generación (ver 3.3) para trazabilidad, pero no se reaplica la semana siguiente.

### 2.4 Fórmula de pronóstico (PT)

```
demanda_pronosticada(producto, día) =
  baseline_semana_siguiente
  × (%día × factor_día)
  × (%producto × factor_producto)
  × factor_puntual_semana
```

### 2.5 Fórmula unificada de "cuánto producir" (PT y SEMI)

La misma fórmula aplica a sabores (PT) y a bases (SEMI) — solo cambia de dónde sale la `demanda`:

```
necesario = demanda − stock_actual + stock_minimo − cocciones_pendientes

cantidad_a_planificar =
  si necesario > 0: max( redondear_arriba(necesario, lote_optimo), lote_minimo )
  si necesario <= 0: 0
```

- `stock_actual`: stock vivo del producto (`v_stock_pt_vivo` / `v_stock_semi_vivo`).
- `stock_minimo`: piso de seguridad, campo nuevo en la ficha de producto (ver sección 3), unificado para PT y SEMI.
- `cocciones_pendientes`: suma de `cant_plan` de las OPs de ese producto que ya existen pero todavía no están finalizadas (`estado` en `planificada` o `en_proceso`) — para no duplicar algo que ya está en camino. Aplica igual a PT ("OPs pendientes de fabricación") y a SEMI ("cocciones pendientes").
- `lote_optimo` / `lote_minimo`: campos nuevos en la ficha de producto (ver sección 3). Si son nulos ("libre"), no hay restricción de redondeo: `redondear_arriba` se comporta como identidad y `lote_minimo` efectivamente es 0.

Para PT, `demanda` es la `demanda_pronosticada` de 2.4. Para SEMI, `demanda` sale de la explosión de recetas (2.6) — **depende de lo que se decidió producir de PT**, no de un pronóstico directo de la base.

### 2.6 Explosión de recetas para SEMI

Una vez calculada `cantidad_a_planificar` para cada sabor PT (paso anterior), se recorre la receta activa de cada uno y se acumula, por cada base que usa:

```
demanda_OT(base) = Σ (receta.cant_subprod × cantidad_a_planificar(pt))
                    para cada PT cuya receta activa usa esa base
```

Con esa `demanda_OT` como `demanda` de la fórmula unificada (2.5), se calcula `cantidad_a_planificar` para cada base. Es el mismo mecanismo que ya usa una receta al finalizar una OP (consumo de ingredientes), aplicado antes en vez de después — acá es explosión prospectiva (MRP), no consumo real.

### 2.7 Flujo de generación del plan

1. Usuario (rol gestión/admin) entra a `/pcp` al cierre del día y dispara "Generar plan de mañana".
2. El sistema calcula todo lo anterior (2.1 a 2.6) para los 24 sabores de la cartilla y todas las bases que usan sus recetas activas.
3. Se muestra una pantalla de revisión: una fila por producto (PT primero, SEMI después) con demanda pronosticada / stock actual / mínimo / cocciones pendientes / necesario / cantidad a planificar. La cantidad a planificar es editable antes de confirmar.
4. Al confirmar, se crea una OP (`estado = 'planificada'`, `fecha_plan` = mañana) por cada fila con cantidad > 0, usando la lógica ya existente de `createOrdenProduccion` (que ya soporta productos sin receta activa).
5. Se guarda un snapshot histórico (sección 3) por cada fila calculada, con el `id_op` resultante si se generó una.
6. Las OPs creadas se ven y se gestionan igual que cualquier otra (iniciar, finalizar, deshacer vía Auditoría).

Sabores fuera de cartilla, o productos sin receta y sin historial de exhibición, simplemente no generan sugerencia (no hay demanda pronosticada que calcular).

## 3. Modelo de datos nuevo

### 3.1 Ficha de producto (`d_productos`)

Tres columnas nuevas, aplicables a PT y SEMI por igual:
- `stock_minimo NUMERIC` — reemplaza a `cantidad_minima` de `d_exhibidora`. Migración: copiar el valor actual de `cantidad_minima` de cada slot ocupado al `stock_minimo` de su producto, y retirar la columna `cantidad_minima` de `d_exhibidora`.
- `lote_optimo NUMERIC` (nullable = libre)
- `lote_minimo NUMERIC` (nullable = libre)

### 3.2 Factores de ajuste persistentes

Dos tablas nuevas, chicas:

```sql
malaga.pcp_factor_dia_semana (
  dia_semana SMALLINT PRIMARY KEY CHECK (dia_semana BETWEEN 1 AND 7), -- ISO: 1=lunes
  factor NUMERIC(6,3) NOT NULL DEFAULT 1.0
)

malaga.pcp_factor_producto (
  id_prod INTEGER PRIMARY KEY REFERENCES malaga.d_productos(id_prod),
  factor NUMERIC(6,3) NOT NULL DEFAULT 1.0
)
```

Se inicializan (seed) con los 7 días y los productos actuales en 1.0; se editan desde la pantalla de PCP o su configuración.

### 3.3 Snapshot histórico de pronóstico

```sql
malaga.f_pcp_pronostico (
  id_pronostico SERIAL PRIMARY KEY,
  fecha_plan DATE NOT NULL,
  id_prod INTEGER NOT NULL REFERENCES malaga.d_productos(id_prod),
  demanda_pronosticada NUMERIC(12,3),
  stock_actual_momento NUMERIC(12,3) NOT NULL,
  stock_minimo_momento NUMERIC(12,3) NOT NULL,
  cocciones_pendientes_momento NUMERIC(12,3) NOT NULL,
  necesario NUMERIC(12,3) NOT NULL,
  cantidad_planificada NUMERIC(12,3) NOT NULL,
  factor_puntual_semana NUMERIC(6,3),
  id_op_generada INTEGER REFERENCES malaga.f_ordenes_produccion(id_op),
  ts_generado TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_generado INTEGER REFERENCES malaga.usuarios(id_user)
)
```

Una fila por producto por cada vez que se genera un plan (PT y SEMI mezclados, se distinguen por `d_productos.tipo_producto`). Esta tabla es la que alimenta el "pronóstico vs. real" del dashboard de Fase 2 a medida que se acumulan generaciones.

### 3.4 Retiro de lo viejo

Se eliminan (no se dejan "por las dudas"): la vista `v_planificacion_diaria`, y las funciones `listPlanificacion` / `actualizarMinimo` de `src/lib/exhibidora/queries.ts` junto con sus tests — quedaron sin pantalla en la sesión anterior y este módulo las reemplaza por completo (el mínimo se unifica en la ficha de producto, y "cuánto producir" ahora sale de la fórmula completa en vez de un umbral simple).

## 4. Fase 2 — Dashboard de estadísticas

Vive en la misma sección `/pcp`, como una vista adicional (no una pantalla aislada) — es tanto el lugar donde se revisan las tendencias como el lugar donde se ve, en números concretos, qué está usando el motor de Fase 1.

- **Tendencia semanal (8 semanas)**: gráfico de la demanda semanal total (de 2.1), con la recta de tendencia ajustada y el punto proyectado de la semana siguiente resaltado.
- **Demanda por producto**: tabla/gráfico de barras con el % de cada sabor (de 2.2).
- **Demanda por día de la semana**: gráfico de barras con los 7 días (de 2.2).
- **Clima en Málaga**: pronóstico de los próximos ~7 días (temperatura, condición, probabilidad de lluvia) vía [Open-Meteo](https://open-meteo.com/) (gratis, sin API key, buena cobertura en España). Es contexto visual para decidir si aplicar un factor puntual esa semana — **no** entra todavía en la fórmula matemática de pronóstico (no hay historial de demanda-vs-clima como para calibrar esa relación con datos reales). Candidato claro para una fase futura.
- **Insights**: frases auto-generadas con plantillas simples a partir de los mismos agregados (ej. "Los sábados son tu día de mayor demanda, un 40% por encima de un lunes promedio"). Sin generación por IA — reglas fijas sobre los números ya calculados.
- **Pronóstico vs. real**: usando `f_pcp_pronostico`, comparación de lo pronosticado contra lo efectivamente producido/consumido en generaciones pasadas. Vacío al principio, se va llenando solo con el uso.

## 5. Navegación y permisos

- Nueva sección de menú "PCP" (ruta `/pcp`), separada de "Cartilla actual" — Cartilla sigue siendo pura gestión de los 24 slots; PCP decide cuánto producir.
- Acceso restringido a roles `gestión` y `admin` (como Auditoría): generar el plan del día crea OPs en lote, es una acción administrativa de cierre de jornada, no tarea de piso.
- Las OPs generadas por PCP no son un tipo especial de OP — se ven, inician, finalizan y deshacen exactamente igual que las creadas a mano desde "Nueva Orden", incluyendo el flujo de Auditoría ya existente.

## 6. Supuestos y preguntas abiertas

- El pronóstico se calcula solo para sabores actualmente en cartilla (24 slots). Un sabor recién agregado usa el historial que tenga disponible, por corto que sea.
- No hay historial suficiente (menos de ~2 semanas de exhibiciones) el primer día que se prenda este módulo: la baseline y los % van a ser poco confiables al principio y van a mejorar solos con el uso. No se bloquea el cálculo por esto, pero vale la pena que el usuario lo sepa al usarlo por primera vez.
- El clima no ajusta la fórmula todavía (sección 4) — queda como entrada manual vía el factor puntual de semana, a criterio del usuario.
- Quiebres queda completamente fuera de este spec (sección 1).
