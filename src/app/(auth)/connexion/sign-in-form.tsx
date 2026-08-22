"use client";

import { useActionState } from "react";
import { signIn } from "@/lib/auth/actions";
import { IDLE } from "@/lib/auth/action-state";
import { Alert, Field, Input, SubmitButton } from "../_components/form";

export function SignInForm({ suite }: { suite?: string }) {
  const [state, action] = useActionState(signIn, IDLE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {/* Écran demandé avant d'être renvoyé ici par le middleware. */}
      {suite ? <input type="hidden" name="suite" value={suite} /> : null}

      <Alert state={state} />

      <Field label="Adresse e-mail" htmlFor="email" errors={errors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="hugo@exemple.fr"
          invalid={Boolean(errors.email?.length)}
        />
      </Field>

      <Field label="Mot de passe" htmlFor="password" errors={errors.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          invalid={Boolean(errors.password?.length)}
        />
      </Field>

      <SubmitButton className="mt-2 w-full" pendingLabel="Connexion…">
        Se connecter
      </SubmitButton>
    </form>
  );
}
