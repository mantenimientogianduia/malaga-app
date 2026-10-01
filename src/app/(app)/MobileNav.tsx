"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/logout/actions";
import { NAV_ITEMS } from "./navItems";
import { IconMenu } from "@/components/icons";
import type { SessionUser } from "@/lib/auth/session";

const PRIMARY_HREFS = ["/", "/exhibir", "/stock", "/productos", "/ordenes"];

export function MobileNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const primary = NAV_ITEMS.filter((i) => PRIMARY_HREFS.includes(i.href));
  const overflow = NAV_ITEMS.filter((i) => !PRIMARY_HREFS.includes(i.href));

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/40 md:hidden" onClick={() => setOpen(false)}>
          <div
            className="flex flex-col gap-1 rounded-t-2xl bg-[#3d2617] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <div>
                <div className="truncate text-sm font-semibold text-[#e8d9c3]">{user.email}</div>
                <div className="text-[11px] capitalize text-[#8a7458]">{user.rol}</div>
              </div>
              <div className="flex items-center gap-1">
                <Link
                  href="/cuenta"
                  prefetch={false}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-[#8a7458] transition-colors hover:bg-white/[0.05] hover:text-copper"
                >
                  Mi cuenta
                </Link>
                <form action={logout}>
                  <button
                    type="submit"
                    className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-[#8a7458] transition-colors hover:bg-white/[0.05] hover:text-copper"
                  >
                    Cerrar sesión
                  </button>
                </form>
              </div>
            </div>
            {overflow.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                prefetch={false}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(href)
                    ? "bg-white/[0.08] text-[#f8efe1]"
                    : "text-[#c9baa4] hover:bg-white/[0.05] hover:text-[#f8efe1]"
                }`}
              >
                <Icon className={isActive(href) ? "text-copper" : "text-[#8a7458]"} />
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-black/10 bg-[#3d2617] pb-[env(safe-area-inset-bottom)] md:hidden">
        {primary.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                active ? "text-copper" : "text-[#c9baa4]"
              }`}
            >
              <Icon />
              {label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-[#c9baa4]"
        >
          <IconMenu />
          Más
        </button>
      </nav>
    </>
  );
}
