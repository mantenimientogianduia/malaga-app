import Link from "next/link";
import { requireUser } from "@/lib/auth/requireRole";
import { listPuntosConEstadoHoy, getCierreHoy } from "@/lib/temperaturas/queries";

export default async function Home() {
  const user = await requireUser();
  const [puntos, cierre] = await Promise.all([listPuntosConEstadoHoy(), getCierreHoy()]);
  const faltan = puntos.filter((p) => !p.registradoHoy).length;

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <h1 className="mb-2 text-xl font-semibold text-ink">Hola, {user.email}</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Elegí un módulo en el menú de la izquierda para empezar.
      </p>

      {!cierre && (
        <Link
          href="/temperaturas"
          className={`block rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
            faltan > 0
              ? "bg-warn-tint text-warn hover:bg-warn-tint/80"
              : "bg-copper-tint text-copper-strong hover:bg-copper-tint/80"
          }`}
        >
          {faltan > 0
            ? `Faltan cargar ${faltan} de 8 temperaturas de hoy — tocá para ir a Temperaturas.`
            : "Las temperaturas de hoy están completas — tocá para ir a Temperaturas y cerrar el día."}
        </Link>
      )}
    </div>
  );
}
