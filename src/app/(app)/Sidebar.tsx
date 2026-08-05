"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/logout/actions";
import { NAV_ITEMS } from "./navItems";
import type { SessionUser } from "@/lib/auth/session";

export function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 flex-none flex-col gap-8 bg-[#3d2617] px-4 py-6 md:flex">
      <div className="flex flex-col gap-1 px-2">
        <span className="font-display text-[26px] italic leading-none text-[#f8efe1]">
          Malaga Soft
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-copper">
          Heladería · Producción
        </span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                active
                  ? "bg-white/[0.08] text-[#f8efe1]"
                  : "text-[#c9baa4] hover:bg-white/[0.05] hover:text-[#f8efe1]"
              }`}
            >
              <Icon
                className={active ? "text-copper" : "text-[#8a7458] group-hover:text-copper"}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3 border-t border-white/10 pt-4 text-[11px]">
        <div className="px-2">
          <div className="truncate font-semibold text-[#e8d9c3]">{user.email}</div>
          <div className="capitalize text-[#8a7458]">{user.rol}</div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-medium text-[#8a7458] transition-colors hover:bg-white/[0.05] hover:text-copper"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
