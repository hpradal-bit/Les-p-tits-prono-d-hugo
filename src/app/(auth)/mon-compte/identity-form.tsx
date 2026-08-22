"use client";

import { useActionState } from "react";
import { updateIdentity } from "@/lib/auth/actions";
import { IDLE } from "@/lib/auth/action-state";
import { Alert, Field, Input, SubmitButton } from "../_components/form";

export function IdentityForm({
  firstName,
  displayName,
}: {
  firstName: string;
  displayName: string;
}) {
  const [state, action] = useActionState(updateIdentity, IDLE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Alert state={state} />

      <Field label="Prénom" htmlFor="firstName" errors={errors.firstName}>
        <Input
          id="firstName"
          name="firstName"
          defaultValue={firstName}
          required
          autoComplete="given-name"
          invalid={Boolean(errors.firstName?.length)}
        />
      </Field>

      <Field
        label="Pseudo"
        htmlFor="displayName"
        hint="C'est ce nom qui s'affiche au classement."
        errors={errors.displayName}
      >
        <Input
          id="displayName"
          name="displayName"
          defaultValue={displayName}
          required
          autoComplete="nickname"
          invalid={Boolean(errors.displayName?.length)}
        />
      </Field>

      <SubmitButton className="mt-1 self-start" size="sm" pendingLabel="Enregistrement…">
        Enregistrer
      </SubmitButton>
    </form>
  );
}
