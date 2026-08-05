import { requireUser } from "@/lib/auth/requireRole";

export default async function Home() {
  const user = await requireUser();

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <h1 className="mb-2 text-xl font-semibold text-ink">Hola, {user.email}</h1>
      <p className="text-sm text-ink-soft">
        Elegí un módulo en el menú de la izquierda para empezar.
      </p>
    </div>
  );
}
