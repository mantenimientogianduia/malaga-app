import Link from "next/link";
import { requireUser } from "@/lib/auth/requireRole";
import { listPuntosConEstadoHoy } from "@/lib/temperaturas/queries";

export default async function Home() {
  const user = await requireUser();
  const puntos = await listPuntosConEstadoHoy();
  const faltan = puntos.filter((p) => !p.registradoHoy).length;

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <h1 className="mb-2 text-xl font-semibold text-ink">Hola, {user.email}</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Elegí un módulo en el menú de la izquierda para empezar.
      </p>

      {faltan > 0 && (
        <Link
          href="/temperaturas"
          className="block rounded-lg bg-warn-tint px-4 py-3 text-sm font-medium text-warn transition-colors hover:bg-warn-tint/80"
        >
          Faltan cargar {faltan} de 8 temperaturas de hoy — tocá para ir a Temperaturas.
        </Link>
      )}
    </div>
  );
}
