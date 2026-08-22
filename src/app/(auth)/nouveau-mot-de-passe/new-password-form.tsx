"use client";

import { useActionState } from "react";
import { updatePassword } from "@/lib/auth/actions";
import { IDLE } from "@/lib/auth/action-state";
import { Alert, Field, Input, SubmitButton } from "../_components/form";

export function NewPasswordForm() {
  const [state, action] = useActionState(updatePassword, IDLE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Alert state={state} />

      <Field
        label="Nouveau mot de passe"
        htmlFor="password"
        hint="8 caractères minimum."
        errors={errors.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          invalid={Boolean(errors.password?.length)}
        />
      </Field>

      <Field label="Confirmation" htmlFor="confirmation" errors={errors.confirmation}>
        <Input
          id="confirmation"
          name="confirmation"
          type="password"
          required
          autoComplete="new-password"
          invalid={Boolean(errors.confirmation?.length)}
        />
      </Field>

      <SubmitButton className="mt-2 w-full" pendingLabel="Enregistrement…">
        Changer mon mot de passe
      </SubmitButton>
    </form>
  );
}
