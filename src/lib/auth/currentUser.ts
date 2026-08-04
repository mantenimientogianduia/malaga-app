import { cookies } from "next/headers";
import { getSessionUser, type SessionUser } from "./session";
import { SESSION_COOKIE_NAME } from "./constants";

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return getSessionUser(token);
}
