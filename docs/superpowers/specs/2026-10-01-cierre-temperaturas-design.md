# Cierre y edición del registro de temperaturas — Design Spec

**Fecha:** 2026-10-01
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## Contexto y problema

El módulo de temperaturas (`docs/superpowers/specs/2026-09-30-temperaturas-design.md`) ya está en producción: 8 puntos fijos de medición, un registro por punto por día, banner de recordatorio, resumen de 30 días e historial. Pero cada día es solo un conjunto suelto de hasta 8 filas en `f_registro_temperaturas` — no hay ninguna noción de "el día quedó cerrado y revisado", y la única forma de corregir un valor cargado por error es "Deshacer" desde Auditoría (que borra el registro entero, obligando a cargarlo de cero).

El usuario pidió, en sus palabras: "que permita guardar el dia y firmar algo. ademas poder editar si es necesario y que quede el registro completo del dia firmado". Esto introduce un concepto nuevo: el **cierre/firma del día**, distinto de la "firma" por registro individual que ya existe (quién cargó cada temperatura).

## Diseño aprobado

### 1. Cierre y firma del día

Tabla nueva `malaga.f_cierre_temperaturas`, una fila por día cerrado:

| Columna | Tipo | Notas |
|---|---|---|
| `fecha` | date PK | Un cierre por día, como mucho |
| `ts_cierre` | timestamptz, default now() | |
| `user_cierre` | int, FK `usuarios` | Quién firmó el cierre |

Mientras un día no tiene fila en esta tabla, está **abierto**: se puede cargar y editar libremente. Un botón **"Cerrar y firmar el día"** en `/temperaturas`, habilitado para los mismos roles que ya cargan temperaturas (`gestion`, `admin`, `produccion`), crea esa fila. Se puede cerrar el día aunque falten puntos por cargar — no es obligatorio completar los 8 primero.

Una vez cerrado, la pantalla muestra "Cerrado — firmado por [email] el [fecha/hora]" en vez de la grilla tocable, y **ninguna acción de escritura sobre ese día** (cargar, editar, deshacer un registro) se permite — todas deben rechazarse con un mensaje claro indicando que el día está cerrado.

### 2. Reabrir un día cerrado

Acción **"Reabrir día"**, restringida a `gestion`/`admin` (más sensible que cerrar, mismo criterio que otras correcciones del sistema). Borra la fila de `f_cierre_temperaturas` de esa fecha — sin dejar rastro de que estuvo cerrado y se reabrió, siguiendo el mismo criterio minimalista elegido para la edición (punto 3).

### 3. Edición in-place de un registro

Hoy, tocar un punto ya cargado muestra una vista de solo lectura. Pasa a mostrar el mismo formulario de carga, precargado con el valor actual, **siempre que el día esté abierto**. Guardar sobreescribe `temperatura`, `ts_registro` y `user_registro` del registro existente — no se guarda quién hizo la edición ni cuál era el valor anterior (edición sin historial, a pedido del usuario). Si el día está cerrado, no se puede editar (ver punto 1).

La función de guardado (`registrarTemperatura`) deja de bloquear un segundo guardado del mismo punto/día — en vez de eso, actualiza el registro existente si el día sigue abierto, o rechaza si está cerrado. "Deshacer" desde Auditoría se mantiene como acción separada (para cuando un punto no debería haberse cargado en absoluto, no solo tener el valor mal) y también queda bloqueada si el día está cerrado.

### 4. Banner de Inicio

Se agrega un estado intermedio al banner no bloqueante existente:
- Si faltan registros de hoy: "Faltan cargar N de 8 temperaturas de hoy..." (sin cambios).
- Si están las 8 pero el día sigue abierto (sin cerrar): "Las temperaturas de hoy están completas — falta cerrar y firmar el día."
- Si el día está cerrado: sin banner.

## Fuera de alcance

- No hay historial de ediciones (quién cambió qué valor y cuándo) — decisión explícita del usuario.
- No hay historial de reaperturas (cuántas veces se reabrió un día cerrado) — mismo criterio.
- No se agrega una vista separada de "días firmados" más allá de lo que ya muestra la pantalla para el día de hoy; si hace falta mirar hacia atrás qué días se cerraron y quién firmó, es una mejora a pedir aparte.

## Testing

- `registrarTemperatura` (o su reemplazo) actualiza en vez de bloquear cuando el punto ya tiene registro de hoy y el día está abierto.
- Cualquier escritura (registrar, editar, deshacer) sobre un día cerrado se rechaza con un error claro.
- Cerrar el día funciona con 0, algunos o los 8 puntos cargados.
- Reabrir libera el día para volver a escribir.
- El banner de Inicio refleja los 3 estados (faltan, completas sin cerrar, cerrado).
