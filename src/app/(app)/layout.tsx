import type { ReactNode } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth/requireRole";
import { logout } from "@/app/logout/actions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen w-full">
      <aside className="flex w-60 flex-none flex-col gap-10 bg-[#4a2e1c] px-6 py-8">
        <div className="flex flex-col gap-1">
          <span className="font-display text-2xl italic leading-none text-[#f6ecd9]">
            Malaga Soft
          </span>
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-copper">
            Heladería · Producción
          </span>
        </div>

        <nav className="flex flex-col gap-1">
          <Link
            href="/"
            className="rounded-md px-3 py-2 text-sm font-medium text-[#cfc3ac] hover:bg-white/5 hover:text-[#f6ecd9]"
          >
            Inicio
          </Link>
          <Link
            href="/productos"
            className="rounded-md px-3 py-2 text-sm font-medium text-[#cfc3ac] hover:bg-white/5 hover:text-[#f6ecd9]"
          >
            Productos
          </Link>
          <Link
            href="/recetas"
            className="rounded-md px-3 py-2 text-sm font-medium text-[#cfc3ac] hover:bg-white/5 hover:text-[#f6ecd9]"
          >
            Recetas
          </Link>
          <Link
            href="/ordenes"
            className="rounded-md px-3 py-2 text-sm font-medium text-[#cfc3ac] hover:bg-white/5 hover:text-[#f6ecd9]"
          >
            Órdenes
          </Link>
        </nav>

        <div className="mt-auto flex flex-col gap-3 text-[11px] text-[#8a9a90]">
          <div>
            <div className="font-semibold text-[#cfc3ac]">{user.email}</div>
            <div>{user.rol}</div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="text-left text-[11px] font-medium text-[#8a9a90] hover:text-copper"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 bg-bg">{children}</main>
    </div>
  );
}
