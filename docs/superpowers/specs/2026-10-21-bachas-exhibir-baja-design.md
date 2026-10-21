# Bachas: exhibir con fecha editable y baja sin exhibir — Design Spec

**Fecha:** 2026-10-21
**Estado:** Diseño aprobado por el usuario, pendiente de plan de implementación.
**Modifica:** `2026-10-19-pcp-cierre-dia-design.md` (bloque 1 del cierre) y la pantalla Exhibir.

## 1. Contexto y problema

1. **Cierre del día de PCP.** El bloque "Bachas del obrador" deja destildar las bachas que no están físicamente y las da de baja por "ajuste". Es incorrecto: si una bacha no está en el obrador, lo más probable es que se haya exhibido sin registrarlo, y lo correcto es exhibirla en el sistema (o, si realmente no existe más, darla de baja con constancia).
2. **Exhibir.** Hoy "Exhibir" siempre registra la fecha y hora de ese instante. Si alguien se olvida de registrar una exhibición, no puede corregir el momento real.
3. **Baja de bachas.** Solo existe la baja manual de bases (remanentes, en Stock). No hay forma de dar de baja una bacha de producto terminado que nunca se exhibió, con motivo y observación.

## 2. Diseño aprobado

### 2.1 Cierre del día: sin destildar

- El bloque "1. Bachas del obrador" pasa a ser una **lista de solo lectura** (por sabor: kg y lote).
- Se agrega un aviso fijo: "¿Falta alguna bacha? Exhibila o dala de baja desde Exhibir y volvé a cargar esta pantalla" con un link a `/exhibir`.
- Se eliminan las casillas, el campo `ausentes` del envío y la baja automática por "ajuste" del cierre. El cierre calcula con lo que figure en el obrador al momento de confirmar.

### 2.2 Exhibir con fecha y hora editables

- Junto a cada botón "Exhibir" (posiciones de la cartilla y bachas "sin posición asignada") aparece **"Fecha y hora: ahora · Cambiar"**.
  - Sin tocar nada se exhibe con la hora actual, igual que hoy.
  - "Cambiar" abre un campo de fecha y hora ya cargado con el momento actual del dispositivo, editable.
- **Límites:** la fecha y hora no pueden ser futuras (se tolera 1 minuto de desfase de reloj) ni caer en un día anterior a la fabricación de la bacha (`fecha_fab`, comparada en la zona horaria de Málaga). Si no cumple, se muestra un error claro y no se pierde nada de lo cargado.
- **Efectos:**
  - Esa fecha y hora quedan como momento de exhibición (`ts_exhibicion`).
  - Un quiebre abierto del sabor se cierra con ese mismo momento (nunca antes del momento del quiebre: `GREATEST(ts_quiebre_real, momento)`).
  - La "bacha vigente" de una posición sigue siendo la exhibida más recientemente: exhibir con fecha pasada una bacha vieja no reemplaza a la vigente.
- No se puede exhibir una bacha que tenga baja.

### 2.3 Dar de baja una bacha sin exhibirla

- En Exhibir, junto a "Exhibir", la bacha seleccionada tiene un botón **"Dar de baja"** que abre un formulario inline con:
  - **Motivo**: Scrap / Vencido / Ajuste (los mismos tres que ya usa Stock para las bases).
  - **Observación obligatoria** (no vacía después de recortar espacios).
- Solo se pueden dar de baja bachas de PT que no estén exhibidas ni tengan baja previa.
- **Registro:** la baja queda en `f_partidas_stock` (`ts_baja_manual`, `motivo_baja_manual`, `user_baja_manual` y la columna nueva `obs_baja_manual`). Auditoría la muestra en "Cierres de remanente recientes" con producto, motivo, observación, quién y cuándo, y se puede **deshacer** desde ahí (deshacer limpia también la observación).

## 3. Datos

```sql
ALTER TABLE malaga.f_partidas_stock ADD COLUMN obs_baja_manual TEXT;
```

Las bajas anteriores (de bases) quedan con observación nula. La obligatoriedad de la observación se exige en la aplicación para las bajas de bachas.

## 4. Fuera de alcance

- Dar de baja bachas ya exhibidas.
- Reportes de bajas por motivo.
- Cambiar el orden de "Exhibiciones recientes" de Auditoría cuando una exhibición tiene fecha pasada.

## 5. Testing

- `exhibirPartida` con fecha propia: la guarda; rechaza futuras, anteriores a la fabricación y fechas inválidas; rechaza bachas con baja; cierra el quiebre abierto con ese momento (y nunca antes del quiebre); sin fecha usa `now()`; exhibir con fecha pasada una bacha vieja no cambia la bacha vigente de la posición.
- `darDeBajaBachaPt`: guarda motivo, observación y usuario; exige observación y motivo válido; rechaza bachas exhibidas, ya dadas de baja o de SEMI; después de la baja la bacha no aparece en `listPartidasEnObrador` ni en `listBachasObrador`.
- `deshacerCierreRemanente` limpia también la observación.
- El cierre de PCP sigue funcionando sin `ausentes` (incluido el test de rollback real).
- Verificación manual en el navegador: exhibir con fecha editada, errores de fecha, baja con observación, que aparezca en Auditoría y se pueda deshacer, y el aviso del cierre.
