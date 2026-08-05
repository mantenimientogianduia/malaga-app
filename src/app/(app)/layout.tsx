import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/requireRole";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar user={user} />
      <main className="min-w-0 flex-1 bg-bg pb-16 md:pb-0">{children}</main>
      <MobileNav user={user} />
    </div>
  );
}
