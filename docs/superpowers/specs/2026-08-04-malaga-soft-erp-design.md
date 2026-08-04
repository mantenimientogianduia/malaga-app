# Malaga Soft — ERP para heladería con fabricación propia (Málaga)

- **Autor / dueño del producto:** Gino Pieretti
- **Fecha:** 2026-08-04
- **Estado:** Diseño aprobado, pendiente de plan de implementación

## 1. Resumen

Malaga Soft es un ERP nuevo, desarrollado 100% con Claude, para una heladería con mini-abastecimiento/producción propia en Málaga (misma marca que Gianduia360/G360, pero negocio y equipo independientes). Reemplaza el sistema actual, hecho en AppSheet sobre Google Sheets. v1 cubre recetas, órdenes de producción, stock de producto terminado y semielaborados, gestión de la cartilla de 24 sabores, y planificación diaria de producción.

## 2. Contexto y decisiones previas

- **G360 no es este proyecto.** G360 es el ERP de la fábrica de Gianduia en Rosario. Malaga Soft es independiente: no comparte datos, tablas ni lógica de negocio con G360.
- **Salida de AppSheet/Google Sheets.** El sistema actual usa AppSheet con Google Sheets como base. Se decidió no continuar con Sheets como base de datos porque el modelo necesario (stock en vivo con movimientos concurrentes, recetas multinivel, planificación que cruza stock y cartilla, expansión futura a multi-sucursal) requiere integridad relacional y transacciones reales, algo que Sheets maneja mal a esa escala de complejidad — aunque el equipo sea chico (2-3 usuarios).
- **Postgres en el mismo servidor que G360, esquema separado.** Para no sumar costo de una base nueva en la nube, Malaga Soft vive en el mismo servidor PostgreSQL que `gianduia360-bbdd`, pero en su propio esquema (ej. `malaga`), completamente aislado de `g360` a nivel de datos y de permisos.
- **Sin necesidad de funcionamiento offline.** Hay conexión a internet siempre disponible en el obrador y en oficina, así que Malaga Soft es una aplicación web estándar, sin sincronización local.

## 3. Alcance v1

**Incluido:**
- Recetas (multinivel, versionadas)
- Órdenes de producción (OP)
- Stock de producto terminado (PT) y semielaborados (SEMI)
- Trazabilidad de insumos consumidos por OP (lote a lote)
- Cartilla / gestión de los 24 sabores en exhibidora
- Planificación diaria basada en reglas (stock vivo vs. mínimo por sabor)
- Usuarios y roles básicos (producción, gestión, admin)

**Explícitamente fuera de alcance v1** (el modelo de datos no debe bloquearlos a futuro):
- Compras a proveedores
- Ventas / punto de venta
- Stock de materias primas (se sigue llevando "a ojo")
- Multi-sucursal y envíos entre locales (se deja el campo `sucursal` preparado en las tablas relevantes, pero no hay lógica de transferencia en v1)
- Pronóstico de demanda (v1 usa reglas simples de mínimo por sabor, no series de tiempo)

## 4. Arquitectura técnica

- **Base de datos:** PostgreSQL, mismo servidor que G360, esquema propio y aislado (ej. `malaga`). Rol de base de datos dedicado con permisos únicamente sobre ese esquema — sin acceso cruzado a `g360` en ninguna dirección.
- **Aplicación:** una sola app web full-stack (backend + frontend integrados, ej. Next.js), un solo deploy.
- **Acceso:** navegador web desde celular/tablet en el obrador y PC/notebook en oficina. Responsive, sin apps nativas.
- **Hosting:** proveedor tipo Render (ya usado en `fudo-mcp-server`) o similar, de bajo costo/mantenimiento.
- **Auth:** login simple con roles (`produccion`, `gestion`, `admin`). Contraseñas siempre hasheadas (bcrypt/argon2), nunca en texto plano.
- **Sin offline.** Cliente web estándar, sin sincronización local ni PWA offline-first.

## 5. Modelo de datos (v1)

### `usuarios`
| campo | notas |
|---|---|
| `id_user` | PK |
| `email` | |
| `password_hash` | nunca texto plano |
| `rol` | produccion / gestion / admin |
| `activo` | |
| `fecha_alta` | |

### `d_productos`
| campo | notas |
|---|---|
| `id_prod` | PK |
| `detalle`, `sector`, `familia`, `unid_med` | |
| `tipo_producto` | PT / SEMI (deja lugar a MP a futuro) |
| `peso_estandar` | **obligatorio si `tipo_producto = PT`**. Peso estándar de una bacha de ese sabor (varía por producto según decoración/densidad). Usado por la planificación diaria para traducir un faltante en kg a una cantidad de OP a crear (ver sección 7) |
| `activo` | |

### `recetas`
| campo | notas |
|---|---|
| `id_receta` | PK |
| `id_prod` | FK `d_productos`, producto que se fabrica con esta receta |
| `version` | |
| `activa` | cuál versión rige hoy |
| `fecha_alta`, `user_alta` | |

### `recetas_detalles`
| campo | notas |
|---|---|
| `id_det_receta` | PK |
| `id_receta` | FK `recetas` |
| `id_prod_padre` | FK `d_productos`, denormalizado (= `recetas.id_prod`) |
| `id_subprod` | FK `d_productos`, insumo (puede ser SEMI con receta propia, o insumo sin stock) |
| `cant_subprod` | |

### `f_ordenes_produccion`
| campo | notas |
|---|---|
| `id_op` | PK |
| `id_prod` | FK `d_productos`, qué se produce |
| `id_receta` | FK `recetas` |
| `cant_plan`, `cant_real` | planificado vs. rendimiento real. **Cada OP genera exactamente una partida** (relación 1:1 con `f_partidas_stock`, ver abajo). Para PT, `cant_plan` normalmente es igual al `peso_estandar` del producto (una OP = una bacha); si hace falta más cantidad, se crean varias OP en vez de una OP más grande |
| `fecha_plan`, `fecha_real` | |
| `ts_ini`, `ts_fin` | |
| `user_ini`, `user_fin` | |
| `estado` | planificada / en_proceso / finalizada / cancelada |
| `obs` | |

### `f_partidas_stock`
Ledger de lotes físicos de PT y SEMI. La lógica de "vigencia" difiere por tipo (ver sección 7).

| campo | notas |
|---|---|
| `id_partistock` | PK |
| `id_prod` | FK `d_productos` |
| `cantidad` | (antes "peso"; genérico para admitir unidades no-peso) |
| `fecha_fab`, `lote` | |
| `ts_ingreso` | alta de la partida |
| `id_op_origen` | FK `f_ordenes_produccion`, **única** (una OP no puede generar más de una partida) |
| `ts_exhibicion`, `id_exhibidora`, `user_exhibicion` | **solo PT**: cuándo y en qué slot se exhibió |
| `ts_baja_manual`, `motivo_baja_manual`, `user_baja_manual` | **solo SEMI** en v1: cierre del remanente (ver sección 7). `motivo_baja_manual`: `scrap` / `vencido` / `ajuste` |
| `sucursal` | preparado para multi-sucursal futuro |

### `f_trazabilidad_op`
| campo | notas |
|---|---|
| `id_traz` | PK |
| `id_op` | FK `f_ordenes_produccion` |
| `id_receta`, `id_detalle_receta` | FK `recetas` / `recetas_detalles` |
| `id_subprod` | FK `d_productos`, insumo consumido |
| `cant_subprod` | cantidad consumida |
| `lote_subprod` | |
| `id_parti_subprod` | FK `f_partidas_stock`, partida física específica consumida |
| `id_prod_op` | denormalizado: producto resultante de la OP |

### `d_exhibidora`
| campo | notas |
|---|---|
| `id_exhibidora` | PK |
| `nro` | 1 a 24 |
| `sucursal` | preparado para multi-sucursal futuro |
| `id_prod` | sabor actual del slot |
| `id_prod_ant`, `id_prod_fut` | para cambios de carta programados |
| `cantidad_minima` | mínimo objetivo para planificación |
| `ts_ulticambio`, `ts_cambio_programado` | |

## 6. Módulos funcionales

1. **Recetas** — alta/edición versionada, multinivel (una receta puede referenciar semielaborados con receta propia).
2. **Órdenes de producción** — creación contra una receta, registro de inicio/fin, cantidad real vs. planificada, genera exactamente una partida de stock al confirmarse. Para PT, se crean normalmente al `peso_estandar` del producto.
3. **Stock PT y SEMI** — vista en vivo, con lógica de vigencia distinta por tipo (ver sección 7). Es un ledger de movimientos, no un contador editable a mano. Incluye la acción, habitual (no excepcional), de cerrar el remanente de una partida de SEMI como scrap cuando queda un resto no aprovechable (consumo por receta rara vez agota el lote exacto a cero).
4. **Trazabilidad** — desde cualquier partida (PT o SEMI) se puede reconstruir qué OP la generó y en qué OP se consumió, lote a lote.
5. **Cartilla / exhibidora** — gestión de los 24 slots activos, alta/baja de sabores, cambios de carta programados, mínimo objetivo por slot.
6. **Planificación diaria (PCP v1)** — cruza stock vivo de PT contra `d_exhibidora` (sabor activo + mínimo) y sugiere qué producir al día siguiente. Basado en reglas simples, no en pronóstico de demanda. El faltante en kg se traduce a una cantidad de OP a crear, redondeando siempre hacia arriba en unidades del `peso_estandar` del producto (ver sección 7) — la sugerencia final es "cuántas OP crear", no un kilaje suelto.
7. **Usuarios y roles** — login, roles `produccion`/`gestion`/`admin`.

## 7. Reglas de negocio clave: ciclo de vida de una partida

**Una OP = una partida.** Toda orden de producción, al confirmarse, genera exactamente una partida de stock (`f_partidas_stock.id_op_origen` es única). No existe el caso de una OP que reparta su producción en varias partidas.

**PT y bachas de peso estándar.** Producto terminado en v1 es únicamente helado, vendido en bachas. Cada producto PT tiene un `peso_estandar` (el peso típico de su bacha, que varía según decoración/densidad del sabor). La planificación diaria no sugiere "producir X kg": sugiere "crear N OP", calculando:

> bachas_sugeridas = CEIL(faltante_kg / peso_estandar) → N OP de `peso_estandar` cada una

Ejemplo: faltan 10 kg de pistacho, `peso_estandar` de pistacho = 4 kg → se sugieren 3 OP (12 kg totales). Producir de más por este redondeo es esperado y aceptado, no es un error a corregir — nunca se sugiere una OP de tamaño no estándar para "ajustar" el sobrante.

**PT (producto terminado):** se mueve como unidad completa, nunca se divide. Una partida deja de estar "vigente en vitrina" cuando **otra partida ocupa el mismo `id_exhibidora`** (mismo sabor repuesto o cambio de carta) — esto se calcula en consulta (vista), no se guarda como campo editado a mano. v1 no contempla baja manual anticipada de PT (se evaluó y se decidió dejarla fuera).

> vigente(PT) = `ts_exhibicion` no nulo Y es la partida más reciente exhibida en ese `id_exhibidora`

**SEMI (semielaborado):** se consume de a partes en distintas OP a lo largo del tiempo. El stock restante no se guarda en una columna, se calcula:

> restante(SEMI) = `cantidad` inicial − suma de `cant_subprod` consumido en `f_trazabilidad_op` para esa partida

En la práctica, el consumo por receta rara vez agota una partida exactamente a cero: queda un remanente chico que no vale la pena seguir usando. Cerrar ese remanente como `scrap` es un flujo **normal y esperado** (no una excepción rara), y queda registrado el motivo y el momento — el propio `restante` calculado en ese instante es la cantidad perdida, sin necesidad de un campo aparte. También se usa `ts_baja_manual` para vencimiento o ajustes por error de carga. Una partida se considera agotada cuando `restante` llega a 0 o cuando se cierra manualmente (cualquiera de los tres motivos).

**Regla clave: la carga de consumos nunca bloquea la operación por falta de stock calculado.** Como el pesaje real nunca es 100% exacto, `restante` puede dar negativo (se consumió más de lo que el sistema tenía registrado para esa partida). Eso es válido y esperado: se guarda igual en `f_trazabilidad_op`, y `restante` negativo queda visible como una señal de datos a revisar (ej. en la vista de stock o en un reporte de precisión de recetas), nunca como un bloqueo a la carga.

**Vistas necesarias (lógicas, no tablas físicas):**
- `v_stock_pt_vivo`
- `v_stock_semi_vivo`
- `v_planificacion_diaria`

## 8. Seguridad

- Rol de base de datos exclusivo para Malaga Soft, permisos solo sobre su propio esquema — sin acceso a `g360` en ninguna dirección.
- Contraseñas siempre hasheadas.
- La base nunca se expone directamente al navegador: todo pasa por el backend.
- Variables de entorno para credenciales de conexión; nunca credenciales en código ni en el repo.

## 9. Roadmap futuro (fuera de v1)

- Compras a proveedores (impacta stock de insumos)
- Stock de materias primas
- Ventas / punto de venta (posible integración con Fudo si se adopta)
- Multi-sucursal: segunda heladería abastecida por la actual, con envíos entre locales (campos `sucursal` ya preparados en v1)
- Pronóstico de demanda para PCP (reemplazando las reglas simples de mínimo por sabor)

## 10. Supuestos y preguntas abiertas

- Se asume que cada `id_exhibidora` (slot 1-24) siempre tiene, como mucho, una partida de PT "vigente" a la vez.
- Se asume que los insumos "a ojo" (sin stock trackeado) en `recetas_detalles` no requieren fila en `d_productos` con `tipo_producto = MP` en v1 — a confirmar en el plan de implementación si conviene modelarlos igual para no romper `recetas_detalles` cuando se agregue stock de materias primas.
- Falta definir el detalle exacto de credenciales/infra del servidor Postgres compartido con G360 (quién lo administra, cómo se provisiona el nuevo rol/esquema) — es un paso operativo, no de diseño.
