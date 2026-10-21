# PCP: demanda semanal repartida por sabor y por día — Design Spec

**Fecha:** 2026-10-21
**Estado:** Diseño aprobado por el usuario, pendiente de plan de implementación.
**Reemplaza:** la carga de "kg/día por sabor" de `2026-10-19-pcp-cierre-dia-design.md` (secciones 3.1, 3.3 y 5).

## 1. Contexto y problema

El cierre del día usa hoy un valor de kg/día por sabor, cargado a mano, igual para todos los días. El usuario prefiere pensar la demanda como **un total semanal pronosticado** que se reparte por sabor y por día de la semana.

## 2. Diseño aprobado

### 2.1 Fórmula

```
demanda_semanal_kg                      (un número; arranca en 550)
pct_sabor(sabor)                        (% de cada sabor sobre el total)
pct_dia(día de la semana)               (% de cada día sobre la semana)

demanda_dia(sabor, fecha) = demanda_semanal_kg × pct_sabor/100 × pct_dia(fecha)/100
demanda_mañana(sabor)     = demanda_dia(sabor, fecha_plan) × (1 + margen_pct/100)
```

El resto de la fórmula de fabricar (stock, pendientes, bachas enteras) no cambia.

### 2.2 Cobertura de las bases

El objetivo de cobertura deja de usar un consumo diario promedio. Se arma con el consumo esperado de los próximos días de cobertura, **empezando por el día siguiente al del plan** (el del plan ya se cubre con el descongelado), con el % de cada día:

```
pesos(dias_cobertura) = [1, 1, ..., resto]      p. ej. 3 → [1,1,1]; 2,5 → [1,1,0,5]; 0 → []

consumo_base(k) = Σ sabores ( cant_subprod × demanda_dia(sabor, fecha_plan + k) × (1 + margen/100) / peso_estandar )

objetivo(base) = Σ_k  pesos[k-1] × consumo_base(k)        k = 1..cantidad de pesos
```

`aReponer`, `descongelar`, `faltante` y el redondeo a lote óptimo/mínimo no cambian. El campo `consumoDiario` que muestra la pantalla pasa a ser el promedio de la ventana (`objetivo / dias_cobertura`, o 0 si los días son 0).

### 2.3 Configuración (pestaña "Configuración" de PCP, solo gestión y admin)

- **Demanda semanal pronosticada (kg):** un campo; valor inicial **550**. Más adelante podrá calcularse automáticamente.
- **% por día de la semana:** una tabla de 7 filas, valores iniciales lunes a jueves 13 % y viernes a domingo 16 % (suman 100 %).
- **% por sabor:** una fila por cada sabor de la cartilla actual o programado. Valores iniciales los que definió el usuario (suman 100,0 %):

| Sabor | % | Sabor | % |
|---|---|---|---|
| Kinder Bueno | 6,00 | Chocolate belga | 5,00 |
| Pistacho | 5,60 | Banana Toffee | 4,00 |
| Crema Oreo | 4,20 | Lemon pie | 3,70 |
| Choco Dubai | 5,00 | Dulce de Leche Rogel | 4,80 |
| Frangipane | 3,70 | Oro y Oro | 3,00 |
| Cheesecake | 3,80 | DDL Granizado | 3,30 |
| Málaga | 3,00 | Gianduia | 4,50 |
| Pistacho macaron | 4,40 | Snickers | 4,00 |
| Fresa | 4,00 | Vainilla | 4,50 |
| Limon con cascaritas | 4,00 | Mango - Maracuya | 6,00 |
| Ciocco Nero (con macadamia) | 3,60 | Tiramisu | 3,00 |
| Yogurt Crock | 2,50 | Caramel Lets pop | 4,40 |

- Cada tabla (días y sabores) se guarda con **un solo botón "Guardar"** y muestra en vivo la **suma** de los %. Si la suma no es 100, se muestra una advertencia pero se puede guardar (no se corrige nada en silencio).
- Margen y días de cobertura se mantienen como están.

### 2.4 Valores iniciales de los sabores

Los % por sabor viven en una tabla que referencia a los productos, así que se pierden cada vez que se reimporta el catálogo. Un script idempotente (`scripts/seed-pcp.ts`) los vuelve a cargar por nombre del sabor (sin distinguir mayúsculas ni acentos) junto con la demanda semanal y los % por día, e informa los nombres que no encuentre en el catálogo.

## 3. Datos

```sql
ALTER TABLE malaga.pcp_config ADD COLUMN demanda_semanal_kg NUMERIC(10,2) NOT NULL DEFAULT 550 CHECK (demanda_semanal_kg >= 0);

CREATE TABLE malaga.pcp_pct_dia (
  dia_semana SMALLINT PRIMARY KEY CHECK (dia_semana BETWEEN 1 AND 7),   -- ISO: 1 = lunes
  pct NUMERIC(5,2) NOT NULL CHECK (pct >= 0 AND pct <= 100)
);
-- semilla: 1..4 = 13, 5..7 = 16

CREATE TABLE malaga.pcp_pct_sabor (
  id_prod INTEGER PRIMARY KEY REFERENCES malaga.d_productos(id_prod),
  pct NUMERIC(5,2) NOT NULL CHECK (pct >= 0 AND pct <= 100)
);

DROP TABLE malaga.pcp_demanda_base;   -- reemplazada; sin datos reales cargados
```

La tabla vieja `pcp_factor_dia_semana` (factores de la primera versión del PCP) sigue sin usarse.

## 4. Fuera de alcance

- Calcular la demanda semanal automáticamente (historial, clima).
- Normalizar automáticamente los % para que sumen 100.
- Cambios en Estadísticas.

## 5. Testing

- Funciones puras: `demandaDiaSabor`, `diaSemanaDeFecha`, `pesosCobertura` (enteros, fraccionarios, 0), suma de %.
- `calcularBases` con días distintos: el objetivo pondera cada día por su consumo (caso con viernes–domingo más fuertes que lunes–jueves) y, sin datos por día, se comporta como antes.
- `getDatosCierre(fechaPlan)` arma la demanda de mañana y de los días siguientes a partir de la semana, los % por sabor y los % por día de las fechas correctas.
- Consultas de configuración: demanda semanal, % por día y % por sabor (lectura y guardado; los sabores sin fila aparecen con 0).
- `confirmarCierre` sigue produciendo los mismos resultados del escenario básico con la nueva configuración.
- Script de semilla: carga los % por nombre (con acentos y mayúsculas distintas), es idempotente e informa los sabores no encontrados.
- Verificación manual en el navegador: las tablas de configuración con la suma en vivo, y un cierre con números chequeados a mano.
