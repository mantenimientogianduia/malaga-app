# Registro diario de temperaturas — Design Spec

**Fecha:** 2026-09-30
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## Contexto y problema

El control de cadena de frío requiere medir la temperatura de la exhibidora todos los días, en 8 puntos fijos: las 4 puntas de cada una de las 2 exhibidoras (que están en paralelo, cada una con 2 filas de 6 posiciones). Hoy esto no se registra en ningún lado del sistema.

Referencia física (imagen provista por el usuario): cada exhibidora se ve de frente con "Obrador" como referencia fija de un lado y "Lado Cliente" del otro — esta etiqueta es la que evita ambigüedad de izquierda/derecha según desde dónde esté parada la persona que mide. Los 8 puntos son, por exhibidora: Obrador-Izquierda, Obrador-Derecha, Cliente-Izquierda, Cliente-Derecha.

**Decisión de modelado clave:** estos 8 puntos son propiedad del **equipo de frío** (la heladera física), no de qué sabor está exhibido en ese momento. Por eso se modelan en una tabla completamente independiente de `d_exhibidora` (que es sobre sabores/cartilla) — evita tener que mapear los 24 `nro` existentes a una posición física que hoy no está documentada en ningún lado del código.

## Modelo de datos

**`malaga.d_puntos_temperatura`** — 8 filas fijas, sembradas una sola vez por una migración (no editable desde la UI, no cambia nunca en la operación normal):

| Columna | Tipo | Notas |
|---|---|---|
| `id_punto` | serial PK | |
| `exhibidora` | int | 1 o 2 |
| `lado` | text | `'obrador'` o `'cliente'` |
| `posicion` | text | `'izquierda'` o `'derecha'` |
| `detalle` | text | Texto armado para mostrar, ej. "Exhibidora 1 · Obrador · Izquierda" |

**`malaga.f_registro_temperaturas`** — un registro por punto por día:

| Columna | Tipo | Notas |
|---|---|---|
| `id_registro` | serial PK | |
| `id_punto` | int, FK `d_puntos_temperatura` | |
| `temperatura` | numeric(4,1) | En °C |
| `ts_registro` | timestamptz, default now() | |
| `user_registro` | int, FK `usuarios` | La "firma" — quién está logueado al cargar |
| `fecha` | date, default `CURRENT_DATE` | Derivada de `ts_registro`, para poder chequear rápido "¿ya se cargó hoy este punto?" sin truncar timestamps en cada query |

**`malaga.config_temperaturas`** — una sola fila (fila `id=1` fija), sin historial de cambios:

| Columna | Tipo | Notas |
|---|---|---|
| `temp_min` | numeric(4,1) | Arranca en -14.0 |
| `temp_max` | numeric(4,1) | Arranca en -12.0 |

Un registro está "dentro de rango" si `temp_min <= temperatura <= temp_max`. Fuera de ese rango es un desvío — se marca visualmente, nunca bloquea el guardado.

## Flujo de carga diaria

Pantalla nueva `/temperaturas`, con entrada propia en la navegación.

**Sección 1 — Grilla de carga:** los 2 exhibidoras en paralelo, tal como la referencia visual del usuario — "Obrador" como etiqueta fija arriba, "Lado Cliente" abajo, 2 filas × 6 columnas por exhibidora. Los 8 puntos de medición son tocables; el resto de las celdas son puramente visuales (completan el dibujo de la exhibidora, no son interactivas). Al tocar un punto sin registro de hoy, se abre un campo simple para cargar la temperatura; al guardar, si está fuera del rango configurado se marca en el momento (borde/color de alerta), pero el guardado nunca se bloquea. Un punto ya cargado hoy se ve visualmente distinto (tildado/con su valor) y, al tocarlo de nuevo, muestra el valor cargado (sin permitir un segundo registro el mismo día para el mismo punto — un punto = un registro por día).

**Sección 2 — Recordatorio:** en la pantalla de Inicio, un banner visible (no bloqueante, se puede seguir usando el resto de la app) mientras no estén cargados los 8 puntos del día de hoy. Desaparece solo al completarse los 8, y vuelve a aparecer al día siguiente si no se cargaron.

**Sección 3 — Historial y reportes**, debajo de la grilla en la misma pantalla `/temperaturas`:
- Tabla de registros recientes: fecha, punto, temperatura, quién lo cargó, si estuvo dentro o fuera de rango (marcado visualmente).
- Resumen: temperatura promedio de los últimos 30 días por punto, y cantidad de desvíos (fuera de rango) en ese mismo período.

## Corrección de errores

Siguiendo el mismo patrón que el resto del sistema (Auditoría ya tiene "deshacer" para exhibiciones, órdenes y cierres de remanente), un registro de temperatura cargado por error debe poder deshacerse desde Auditoría — libera ese punto para poder cargarlo de nuevo el mismo día. Mismos roles que las demás acciones de Auditoría (`gestion`, `admin`).

## Permisos

Cargar temperaturas: mismos roles que ya pueden operar Exhibir/Quiebres (`gestion`, `admin`, `produccion`) — es una tarea operativa diaria de piso. Editar `temp_min`/`temp_max`: solo `gestion`/`admin`, siguiendo el mismo criterio que otras configuraciones sensibles del sistema (ej. programar cambios de cartilla).

## Fuera de alcance

- No hay notificaciones push ni por mail — el "recordatorio" es exclusivamente un banner dentro de la app, no hay infraestructura de envíos en este proyecto y no se agrega acá.
- No se permite más de un registro por punto por día (si se necesitara en el futuro medir varias veces al día, es un cambio de diseño aparte).
- No se liga esta funcionalidad a `d_exhibidora` ni a las 24 posiciones de sabores — son conceptos independientes.
- No hay firma dibujada — la "firma" es el usuario logueado que hizo la carga, igual que en el resto del sistema.
- El rango -14°C a -12°C es un punto de partida dado por el usuario, sujeto a validación posterior — el plan de implementación debe dejarlo fácilmente editable (vía la tabla `config_temperaturas`, sin tocar código) para cuando se confirme el valor real.

## Testing

- Elegibilidad "un registro por punto por día" (bloqueo de duplicado por punto+fecha).
- Cálculo de dentro/fuera de rango contra `config_temperaturas`.
- Banner de recordatorio: aparece cuando faltan registros de hoy, desaparece cuando están los 8, vuelve a aparecer al otro día.
- Promedio y conteo de desvíos sobre una ventana de 30 días.
