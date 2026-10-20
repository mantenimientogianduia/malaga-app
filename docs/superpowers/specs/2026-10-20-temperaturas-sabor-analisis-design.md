# Temperaturas: sabor medido, análisis sensorial y selector de temperatura — Design Spec

**Fecha:** 2026-10-20
**Estado:** Diseño aprobado por el usuario, pendiente de plan de implementación.
**Extiende:** `2026-09-30-temperaturas-design.md` y `2026-10-01-cierre-temperaturas-design.md`.

## 1. Contexto y problema

Hoy cada registro de temperatura guarda solo el punto de medición, el valor, quién lo cargó y cuándo. Para el control de calidad hace falta saber **qué sabor se midió** y dejar constancia del **análisis sensorial/visual** del producto (si está bien o no), con una observación cuando algo no está bien. Además, cargar la temperatura tipeando el valor es lento en el celular: se pide un selector que arranque en -12 y suba o baje de a 0,5 °C.

## 2. Diseño aprobado

### 2.1 Formulario de registro (modal de `/temperaturas`)

Campos, en este orden:

1. **Sabor** (obligatorio). Selector con los sabores de la cartilla actual (los de `d_exhibidora.id_prod`), ordenados por posición en la exhibidora y mostrando "Posición N · Sabor". Sin valor inicial: hay que elegir uno.
2. **Temperatura (°C)**. Arranca en **-12,0**. Botones **−** y **+** que restan y suman **0,5**. El campo sigue siendo editable a mano (se acepta un decimal). Al editar un registro ya cargado arranca en el valor guardado.
3. **Análisis sensorial/visual** (obligatorio). Dos botones, **OK** y **No OK**, sin ninguno elegido al abrir el formulario.
4. **Observación**. Solo se muestra si se eligió **No OK**, y entonces es **obligatoria** (no vacía después de recortar espacios).

El botón "Guardar" queda deshabilitado hasta que estén sabor y análisis, y la observación cuando corresponde. El servidor valida lo mismo y rechaza con un mensaje claro.

### 2.2 Edición y día cerrado

- Editar un registro ya cargado (día abierto) precarga sabor, temperatura, análisis y observación; guardar sobrescribe todo, igual que hoy.
- Con el día **cerrado**, el modal es de solo lectura y muestra además el sabor, el análisis y la observación.
- No cambia nada del cierre/firma del día ni del banner de Inicio.

### 2.3 Visualización

- **Grilla:** una celda cuyo análisis quedó **No OK** muestra un indicador visible (por ejemplo un punto de alerta) además del color por rango de temperatura.
- **Historial reciente** (`/temperaturas`) y la lista de registros recientes de **Auditoría**: columnas nuevas **Sabor** y **Análisis** (OK / No OK; en No OK, la observación visible en la misma celda o como texto secundario). Los registros anteriores a este cambio muestran "—" en sabor y análisis.

## 3. Datos

Migración sobre `malaga.f_registro_temperaturas`:

```sql
ALTER TABLE malaga.f_registro_temperaturas
  ADD COLUMN id_prod INTEGER REFERENCES malaga.d_productos(id_prod),
  ADD COLUMN analisis_ok BOOLEAN,
  ADD COLUMN observacion TEXT,
  ADD CONSTRAINT chk_registro_temperaturas_observacion
    CHECK (analisis_ok IS DISTINCT FROM false OR length(btrim(observacion)) > 0);
```

- Las tres columnas son nulas en los registros viejos; la obligatoriedad se exige en la aplicación (`registrarTemperatura`), no con `NOT NULL`.
- El `CHECK` garantiza a nivel base que un registro con análisis No OK siempre tiene observación.
- `registrarTemperatura(idPunto, temperatura, userRegistro, detalle)` recibe `{ idProd, analisisOk, observacion }`; el upsert por `(id_punto, fecha)` actualiza también esas columnas. Si `analisisOk` es true, la observación se guarda como NULL.
- Nueva consulta `listSaboresExhibidos()` con `{ idProd, nroPosicion, detalle }` ordenados por posición.
- `listPuntosConEstadoHoy`, `listHistorialReciente` y la lista de Auditoría devuelven los campos nuevos.

## 4. Fuera de alcance

- Estadísticas por sabor y resumen de No OK de los últimos 30 días.
- Alertas o avisos automáticos por análisis No OK.
- Completar sabor/análisis de los registros viejos.

## 5. Testing

- `registrarTemperatura` exige sabor y análisis; rechaza No OK sin observación (también con espacios en blanco); guarda y devuelve los campos nuevos; editar sobrescribe sabor, análisis y observación; análisis OK descarta la observación.
- El `CHECK` de la base rechaza un No OK sin observación aunque se inserte directo.
- `listSaboresExhibidos` devuelve los sabores de la cartilla en orden de posición.
- Los registros viejos (sin sabor ni análisis) siguen listándose sin error.
- Verificación manual en el navegador: el selector arranca en -12,0 y sube/baja de a 0,5; No OK muestra y exige la observación; el indicador en la grilla; el solo lectura con el día cerrado.
