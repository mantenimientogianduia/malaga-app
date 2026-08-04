import { getCurrentUser } from "@/lib/auth/currentUser";
import { logout } from "./logout/actions";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-bg px-6 py-24 text-ink">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-copper">
          Heladería · Producción
        </p>
        <h1 className="font-display text-5xl italic leading-none text-ink">
          Malaga Soft
        </h1>
        <p className="max-w-sm text-sm text-ink-soft">
          {user ? `Conectado como ${user.email} (${user.rol})` : "Sesión no encontrada"}
        </p>
      </div>

      <form action={logout}>
        <button
          type="submit"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink hover:border-copper hover:text-copper-strong"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
