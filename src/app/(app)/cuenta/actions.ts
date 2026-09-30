"use server";

import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireRole";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export async function cambiarPasswordAction(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData
) {
  const user = await requireUser();

  const actual = String(formData.get("passwordActual") ?? "");
  const nueva = String(formData.get("passwordNueva") ?? "");
  const confirmacion = String(formData.get("passwordConfirmacion") ?? "");

  if (!actual || !nueva || !confirmacion) {
    return { error: "Completá todos los campos." };
  }

  if (nueva.length < 8) {
    return { error: "La nueva contraseña debe tener al menos 8 caracteres." };
  }

  if (nueva !== confirmacion) {
    return { error: "La confirmación no coincide con la nueva contraseña." };
  }

  const result = await query<{ password_hash: string }>(
    `SELECT password_hash FROM malaga.usuarios WHERE id_user = $1`,
    [user.idUser]
  );
  const passwordHash = result.rows[0]?.password_hash;

  if (!passwordHash || !(await verifyPassword(actual, passwordHash))) {
    return { error: "La contraseña actual no es correcta." };
  }

  const nuevoHash = await hashPassword(nueva);
  await query(`UPDATE malaga.usuarios SET password_hash = $1 WHERE id_user = $2`, [
    nuevoHash,
    user.idUser,
  ]);

  return { success: true };
}
