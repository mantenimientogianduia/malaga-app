import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/requireRole";
import { Sidebar } from "./Sidebar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar user={user} />
      <main className="flex-1 bg-bg">{children}</main>
    </div>
  );
}
