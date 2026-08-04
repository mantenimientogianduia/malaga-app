import { redirect } from "next/navigation";
import { getCurrentUser } from "./currentUser";
import type { SessionUser } from "./session";

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(roles: SessionUser["rol"][]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.rol)) {
    redirect("/");
  }
  return user;
}
