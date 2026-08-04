"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

export async function login(_prevState: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Completá email y contraseña." };
  }

  const result = await query<{ id_user: number; password_hash: string; activo: boolean }>(
    `SELECT id_user, password_hash, activo FROM malaga.usuarios WHERE email = $1`,
    [email]
  );

  const usuario = result.rows[0];
  if (!usuario || !usuario.activo) {
    return { error: "Email o contraseña incorrectos." };
  }

  const valid = await verifyPassword(password, usuario.password_hash);
  if (!valid) {
    return { error: "Email o contraseña incorrectos." };
  }

  const token = await createSession(usuario.id_user);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  redirect("/");
}
