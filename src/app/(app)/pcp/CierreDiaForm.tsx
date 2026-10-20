"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { confirmarCierreAction } from "./cierre-actions";
import { calcularCierre, type StockSabor } from "@/lib/pcp/cierre-calc";
import type { DatosCierre } from "@/lib/pcp/cierre-queries";

const PORCENTAJES = [0, 25, 50, 75, 100];

const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

function aNumeros(editado: Record<number, string>): Record<number, number> {
  const salida: Record<number, number> = {};
  for (const [clave, valor] of Object.entries(editado)) {
    if (valor.trim() !== "" && Number.isFinite(Number(valor))) salida[Number(clave)] = Number(valor);
  }
  return salida;
}

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-ink">{titulo}</h2>
      <p className="mb-3 text-xs text-ink-soft">{ayuda}</p>
      {children}
    </section>
  );
}

export function CierreDiaForm({ datos }: { datos: DatosCierre }) {
  const [state, formAction, pending] = useActionState(confirmarCierreAction, undefined);
  const [ausentes, setAusentes] = useState<Set<number>>(new Set());
  const [pcts, setPcts] = useState<Record<number, number>>({});
  const [stockReal, setStockReal] = useState<Record<number, string>>({});
  const [bachasEdit, setBachasEdit] = useState<Record<number, string>>({});
  const [cocinarEdit, setCocinarEdit] = useState<Record<number, string>>({});

  const stockSabores = useMemo(() => {
    const r: Record<number, StockSabor> = {};
    const de = (idProd: number) => (r[idProd] ??= { kgObrador: 0, kgExhibidaPonderada: 0 });
    for (const b of datos.bachasObrador) {
      if (!ausentes.has(b.idPartida)) de(b.idProd).kgObrador += b.cantidad;
    }
    for (const b of datos.bachasExhibidas) {
      const pct = pcts[b.idPartida];
      if (pct !== undefined) de(b.idProd).kgExhibidaPonderada += (b.cantidad * pct) / 100;
    }
    return r;
  }, [datos.bachasObrador, datos.bachasExhibidas, ausentes, pcts]);

  const bachasOverride = useMemo(() => aNumeros(bachasEdit), [bachasEdit]);
  const cocinarOverride = useMemo(() => aNumeros(cocinarEdit), [cocinarEdit]);

  const resultado = useMemo(
    () =>
      calcularCierre({
        margenPct: datos.margenPct,
        diasCobertura: datos.diasCobertura,
        sabores: datos.sabores,
        stockSabores,
        bases: datos.bases.map((b) => ({
          idProd: b.idProd,
          detalle: b.detalle,
          stockReal: Number(stockReal[b.idProd]) || 0,
          coccionesPendientes: b.coccionesPendientes,
          loteOptimo: b.loteOptimo,
          loteMinimo: b.loteMinimo,
        })),
        bachasOverride,
        cocinarOverride,
      }),
    [datos, stockSabores, stockReal, bachasOverride, cocinarOverride]
  );

  const faltanPct = datos.bachasExhibidas.filter((b) => pcts[b.idPartida] === undefined).length;
  const stockRealValido = (v: string | undefined) => v !== undefined && v.trim() !== "" && Number(v) >= 0;
  const faltanBases = datos.bases.filter((b) => !stockRealValido(stockReal[b.idProd])).length;
  const completo = faltanPct === 0 && faltanBases === 0;

  const payload = JSON.stringify({
    ausentes: Array.from(ausentes),
    pctBachas: Object.entries(pcts).map(([idPartida, pct]) => ({ idPartida: Number(idPartida), pct })),
    stockReal: Object.fromEntries(
      datos.bases.filter((b) => stockRealValido(stockReal[b.idProd])).map((b) => [b.idProd, Number(stockReal[b.idProd])])
    ),
    bachasOverride,
    cocinarOverride,
  });

  if (state?.ok) {
    return (
      <div className="card p-5 text-sm text-ink">
        Cierre confirmado: {state.opsFabricacion} OP{state.opsFabricacion === 1 ? "" : "s"} de fabricación y{" "}
        {state.opsCoccion} de cocción creadas para mañana. Mirá el resumen en{" "}
        <Link href="/pcp?tab=plan" className="font-semibold text-copper hover:text-copper-strong">
          Plan del día
        </Link>{" "}
        o las órdenes en{" "}
        <Link href="/ordenes" className="font-semibold text-copper hover:text-copper-strong">
          Órdenes
        </Link>
        .
      </div>
    );
  }

  const obradorPorSabor = new Map<string, typeof datos.bachasObrador>();
  for (const b of datos.bachasObrador) {
    const lista = obradorPorSabor.get(b.detalle) ?? [];
    lista.push(b);
    obradorPorSabor.set(b.detalle, lista);
  }

  const descongelarConDatos = resultado.bases.filter((b) => b.necesidadFabricacion > 0);
  const cocinarConDatos = resultado.bases.filter((b) => b.consumoDiario > 0 || b.kgACocinar > 0);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="payload" value={payload} />

      <Seccion
        titulo="1. Bachas del obrador"
        ayuda="Bachas terminadas que todavía no salieron a la exhibidora. Destildá las que no estén físicamente."
      >
        {datos.bachasObrador.length === 0 ? (
          <p className="text-sm text-ink-soft">No hay bachas esperando en el obrador.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {Array.from(obradorPorSabor.entries()).map(([detalle, bachas]) => (
              <div key={detalle}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">{detalle}</p>
                <div className="flex flex-col gap-1">
                  {bachas.map((b) => (
                    <label key={b.idPartida} className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={!ausentes.has(b.idPartida)}
                        onChange={(e) => {
                          const siguiente = new Set(ausentes);
                          if (e.target.checked) siguiente.delete(b.idPartida);
                          else siguiente.add(b.idPartida);
                          setAusentes(siguiente);
                        }}
                      />
                      <span className="font-mono">{fmt(b.cantidad)} kg</span>
                      <span className="text-ink-soft">lote {b.lote}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="2. Bachas exhibidas"
        ayuda="¿Cuánto queda de cada bacha exhibida? Es obligatorio elegir un valor en todas."
      >
        {datos.bachasExhibidas.length === 0 ? (
          <p className="text-sm text-ink-soft">No hay bachas exhibidas.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {datos.bachasExhibidas.map((b) => (
              <div key={b.idPartida} className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-ink">
                  <span className="mr-2 font-mono text-xs text-ink-soft">#{b.nroPosicion}</span>
                  {b.detalle} <span className="text-xs text-ink-soft">({fmt(b.cantidad)} kg)</span>
                </div>
                <div className="flex gap-1">
                  {PORCENTAJES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPcts({ ...pcts, [b.idPartida]: p })}
                      className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        pcts[b.idPartida] === p
                          ? "border-copper bg-copper text-white"
                          : "border-border text-ink hover:border-copper hover:text-copper"
                      }`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="3. Bases"
        ayuda="Cargá el stock real de cada base (congelado y descongelado juntos). Se guarda la diferencia con lo que dice el sistema."
      >
        {datos.bases.length === 0 ? (
          <p className="text-sm text-ink-soft">No hay bases cargadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
                  <th className="px-3 py-2">Base</th>
                  <th className="px-3 py-2 text-right">Teórico (sistema)</th>
                  <th className="px-3 py-2 text-right">Real (kg)</th>
                  <th className="px-3 py-2 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {datos.bases.map((b) => {
                  const real = stockReal[b.idProd];
                  const diferencia = stockRealValido(real) ? Number(real) - b.stockTeorico : null;
                  return (
                    <tr key={b.idProd} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium text-ink">{b.detalle}</td>
                      <td className="px-3 py-2 text-right font-mono text-ink-soft">{fmt(b.stockTeorico)}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={real ?? ""}
                          onChange={(e) => setStockReal({ ...stockReal, [b.idProd]: e.target.value })}
                          className="w-24 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-sm"
                        />
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono ${
                          diferencia === null || diferencia === 0 ? "text-ink-soft" : diferencia < 0 ? "text-bad" : "text-ok"
                        }`}
                      >
                        {diferencia === null ? "—" : `${diferencia > 0 ? "+" : ""}${fmt(diferencia)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="4. Plan de mañana"
        ayuda={`Demanda con margen de ${fmt(datos.margenPct)}%. Podés editar las bachas y los kg a cocinar antes de confirmar.`}
      >
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Fabricar (bachas)</h3>
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
                <th className="px-3 py-2">Sabor</th>
                <th className="px-3 py-2 text-right">Demanda</th>
                <th className="px-3 py-2 text-right">Stock</th>
                <th className="px-3 py-2 text-right">Pendientes</th>
                <th className="px-3 py-2 text-right">Bachas</th>
                <th className="px-3 py-2 text-right">Kg</th>
              </tr>
            </thead>
            <tbody>
              {resultado.fabricacion.map((f) => (
                <tr key={f.idProd} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-ink">
                    {f.detalle}
                    {f.sinPeso && (
                      <span className="ml-2 rounded-full bg-warn-tint px-2 py-0.5 text-[10px] font-semibold text-warn">
                        sin peso estándar
                      </span>
                    )}
                    {f.demandaManana === 0 && (
                      <span className="ml-2 rounded-full bg-warn-tint px-2 py-0.5 text-[10px] font-semibold text-warn">
                        sin demanda cargada
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink-soft">{fmt(f.demandaManana)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-soft">{fmt(f.stockDisponible)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-soft">{fmt(f.coccionesPendientes)}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      disabled={f.sinPeso}
                      value={bachasEdit[f.idProd] ?? String(f.bachas)}
                      onChange={(e) => setBachasEdit({ ...bachasEdit, [f.idProd]: e.target.value })}
                      className="w-16 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-sm disabled:opacity-50"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink">{fmt(f.kgAFabricar)}</td>
                </tr>
              ))}
              {resultado.fabricacion.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-ink-soft">
                    No hay sabores en la cartilla.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Descongelar (bases)</h3>
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
                <th className="px-3 py-2">Base</th>
                <th className="px-3 py-2 text-right">Necesita la fabricación</th>
                <th className="px-3 py-2 text-right">Descongelar (kg)</th>
                <th className="px-3 py-2 text-right">Faltante</th>
              </tr>
            </thead>
            <tbody>
              {descongelarConDatos.map((b) => (
                <tr key={b.idProd} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-ink">{b.detalle}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-soft">{fmt(b.necesidadFabricacion)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink">{fmt(b.descongelar)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${b.faltante > 0 ? "font-semibold text-bad" : "text-ink-soft"}`}>
                    {b.faltante > 0 ? `faltan ${fmt(b.faltante)}` : "—"}
                  </td>
                </tr>
              ))}
              {descongelarConDatos.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-ink-soft">
                    La fabricación de mañana no consume bases.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Cocinar (bases)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
                <th className="px-3 py-2">Base</th>
                <th className="px-3 py-2 text-right">Stock tras mañana</th>
                <th className="px-3 py-2 text-right">Objetivo ({fmt(datos.diasCobertura)} días)</th>
                <th className="px-3 py-2 text-right">Pendientes</th>
                <th className="px-3 py-2 text-right">Cocinar (kg)</th>
              </tr>
            </thead>
            <tbody>
              {cocinarConDatos.map((b) => (
                <tr key={b.idProd} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-ink">{b.detalle}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-soft">{fmt(b.stockTrasManana)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-soft">{fmt(b.objetivo)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-soft">{fmt(b.coccionesPendientes)}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={cocinarEdit[b.idProd] ?? String(b.kgACocinar)}
                      onChange={(e) => setCocinarEdit({ ...cocinarEdit, [b.idProd]: e.target.value })}
                      className="w-24 rounded-md border border-border bg-surface-raised px-2 py-1 text-right font-mono text-sm"
                    />
                  </td>
                </tr>
              ))}
              {cocinarConDatos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-ink-soft">
                    No hay bases para cocinar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Seccion>

      {state?.error && <p className="text-sm text-bad">{state.error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || !completo}
          className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-copper-strong disabled:opacity-60"
        >
          {pending ? "Confirmando..." : "Confirmar cierre y generar OPs"}
        </button>
        {!completo && (
          <span className="text-xs text-ink-soft">
            Falta elegir el % de {faltanPct} bacha{faltanPct === 1 ? "" : "s"} y cargar el stock real de {faltanBases}{" "}
            base{faltanBases === 1 ? "" : "s"}.
          </span>
        )}
      </div>
    </form>
  );
}
