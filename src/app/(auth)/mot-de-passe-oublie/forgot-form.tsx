"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/lib/auth/actions";
import { IDLE } from "@/lib/auth/action-state";
import { Alert, Field, Input, SubmitButton } from "../_components/form";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, IDLE);
  const errors = state.fieldErrors ?? {};

  // Une fois le lien parti, on retire le formulaire : rien à saisir de plus.
  if (state.status === "success") return <Alert state={state} />;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Alert state={state} />

      <Field label="Adresse e-mail" htmlFor="email" errors={errors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="hugo@exemple.fr"
          invalid={Boolean(errors.email?.length)}
        />
      </Field>

      <SubmitButton className="mt-2 w-full" pendingLabel="Envoi…">
        Recevoir le lien
      </SubmitButton>
    </form>
  );
}
