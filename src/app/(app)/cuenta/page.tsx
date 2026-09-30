"use client";

import { useActionState } from "react";
import { IconUser } from "@/components/icons";
import { cambiarPasswordAction } from "./actions";

export default function CuentaPage() {
  const [state, formAction, pending] = useActionState(cambiarPasswordAction, undefined);

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-copper-tint text-copper-strong">
          <IconUser className="h-4 w-4" />
        </span>
        <div>
          <p className="page-eyebrow leading-none">Mi cuenta</p>
          <h1 className="text-xl font-semibold text-ink">Cambiar contraseña</h1>
        </div>
      </div>

      <form action={formAction} className="card flex max-w-sm flex-col gap-4 p-5">
        <label className="flex flex-col gap-1 text-sm text-ink">
          Contraseña actual
          <input
            type="password"
            name="passwordActual"
            required
            autoComplete="current-password"
            className="rounded-md border border-border bg-surface-raised px-3 py-2 text-ink outline-none focus:border-copper"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Nueva contraseña
          <input
            type="password"
            name="passwordNueva"
            required
            minLength={8}
            autoComplete="new-password"
            className="rounded-md border border-border bg-surface-raised px-3 py-2 text-ink outline-none focus:border-copper"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Confirmar nueva contraseña
          <input
            type="password"
            name="passwordConfirmacion"
            required
            minLength={8}
            autoComplete="new-password"
            className="rounded-md border border-border bg-surface-raised px-3 py-2 text-ink outline-none focus:border-copper"
          />
        </label>

        {state?.error && <p className="text-sm text-bad">{state.error}</p>}
        {state?.success && <p className="text-sm text-ok">Contraseña actualizada.</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Guardando..." : "Guardar"}
        </button>
      </form>
    </div>
  );
}
