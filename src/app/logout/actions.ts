"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { destroySession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await destroySession(token);
    cookieStore.delete(SESSION_COOKIE_NAME);
  }
  redirect("/login");
}
