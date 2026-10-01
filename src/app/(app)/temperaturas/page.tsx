import { requireRole } from "@/lib/auth/requireRole";
import {
  listPuntosConEstadoHoy,
  getConfigTemperaturas,
  listHistorialReciente,
  getResumen30Dias,
  getCierreHoy,
} from "@/lib/temperaturas/queries";
import { formatFechaHora } from "@/lib/formatDate";
import { IconThermometer } from "@/components/icons";
import { GrillaTemperaturas } from "./GrillaTemperaturas";
import { ConfigTemperaturasForm } from "./ConfigTemperaturasForm";
import { CierreDiaControls } from "./CierreDiaControls";

export default async function TemperaturasPage() {
  const user = await requireRole(["gestion", "admin", "produccion"]);

  const [puntos, config, historial, resumen, cierre] = await Promise.all([
    listPuntosConEstadoHoy(),
    getConfigTemperaturas(),
    listHistorialReciente(),
    getResumen30Dias(),
    getCierreHoy(),
  ]);

  const puedeEditarRango = user.rol === "gestion" || user.rol === "admin";
  const completos = puntos.filter((p) => p.registradoHoy).length;

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-copper-tint text-copper-strong">
          <IconThermometer className="h-4 w-4" />
        </span>
        <div>
          <p className="page-eyebrow leading-none">Vitrina</p>
          <h1 className="text-xl font-semibold text-ink">Temperaturas</h1>
        </div>
      </div>

      <div className="mb-6">
        {puedeEditarRango ? (
          <ConfigTemperaturasForm tempMin={config.tempMin} tempMax={config.tempMax} />
        ) : (
          <p className="text-xs text-ink-soft">
            Rango normal: {config.tempMin}°C a {config.tempMax}°C
          </p>
        )}
      </div>

      <CierreDiaControls cierre={cierre} puedeReabrir={puedeEditarRango} completos={completos} total={puntos.length} />

      <GrillaTemperaturas puntos={puntos} tempMin={config.tempMin} tempMax={config.tempMax} cerrado={cierre !== null} />

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-ink">Promedio y desvíos (últimos 30 días)</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {resumen.map((r) => (
            <div key={r.idPunto} className="card p-3">
              <div className="text-xs font-medium text-ink">{r.puntoDetalle}</div>
              <div className="mt-1 font-mono text-lg font-semibold text-ink">{r.promedio.toFixed(1)}°C</div>
              <div className="text-[10.5px] text-ink-soft">
                {r.desvios} desvío{r.desvios === 1 ? "" : "s"}
              </div>
            </div>
          ))}
          {resumen.length === 0 && (
            <p className="card py-6 text-center text-sm text-ink-soft sm:col-span-2 lg:col-span-4">
              Todavía no hay suficiente historial.
            </p>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-ink">Historial reciente</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
                <th className="px-3.5 py-2.5">Punto</th>
                <th className="px-3.5 py-2.5 text-right">Temperatura</th>
                <th className="px-3.5 py-2.5">Cuándo</th>
                <th className="px-3.5 py-2.5">Quién</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((h) => (
                <tr
                  key={h.idRegistro}
                  className="border-b border-border transition-colors last:border-0 hover:bg-surface-raised"
                >
                  <td className="px-3.5 py-2.5 font-medium text-ink">{h.puntoDetalle}</td>
                  <td
                    className={`px-3.5 py-2.5 text-right font-mono ${h.fueraDeRango ? "text-bad" : "text-ink-soft"}`}
                  >
                    {h.temperatura}°C
                  </td>
                  <td className="px-3.5 py-2.5 text-ink-soft">{formatFechaHora(h.tsRegistro)}</td>
                  <td className="px-3.5 py-2.5 text-ink-soft">{h.userRegistro ?? "—"}</td>
                </tr>
              ))}
              {historial.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3.5 py-6 text-center text-ink-soft">
                    Todavía no hay registros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
