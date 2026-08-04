"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <div className="flex flex-1 items-center justify-center bg-bg px-6">
      <form
        action={formAction}
        className="flex w-full max-w-sm flex-col gap-5 rounded-lg border border-border bg-surface p-8"
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-copper">
            Heladería · Producción
          </p>
          <h1 className="font-display text-4xl italic text-ink">Malaga Soft</h1>
        </div>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="username"
            className="rounded-md border border-border bg-surface-raised px-3 py-2 text-ink outline-none focus:border-copper"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink">
          Contraseña
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-border bg-surface-raised px-3 py-2 text-ink outline-none focus:border-copper"
          />
        </label>

        {state?.error && <p className="text-sm text-bad">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
