"use client";

import { useActionState } from "react";
import { signUp } from "@/lib/auth/actions";
import { IDLE } from "@/lib/auth/action-state";
import { Alert, Field, Input, SubmitButton } from "../_components/form";

export function SignUpForm() {
  const [state, action] = useActionState(signUp, IDLE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Alert state={state} />

      <Field
        label="Code d'invitation"
        htmlFor="inviteCode"
        hint="Hugo te l'a donné. Sans lui, pas d'entrée."
        errors={errors.inviteCode}
      >
        <Input
          id="inviteCode"
          name="inviteCode"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="TOP14-2026"
          invalid={Boolean(errors.inviteCode?.length)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom" htmlFor="firstName" errors={errors.firstName}>
          <Input
            id="firstName"
            name="firstName"
            required
            autoComplete="given-name"
            placeholder="Hugo"
            invalid={Boolean(errors.firstName?.length)}
          />
        </Field>

        <Field label="Pseudo" htmlFor="displayName" errors={errors.displayName}>
          <Input
            id="displayName"
            name="displayName"
            required
            autoComplete="nickname"
            placeholder="Le Boss"
            invalid={Boolean(errors.displayName?.length)}
          />
        </Field>
      </div>

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

      <Field
        label="Mot de passe"
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

      <SubmitButton className="mt-2 w-full" pendingLabel="Création du compte…">
        Créer mon compte
      </SubmitButton>

      <p className="text-center text-[13px] text-ink-faint">
        Aucun e-mail de confirmation à attendre : tu joues tout de suite.
      </p>
    </form>
  );
}
