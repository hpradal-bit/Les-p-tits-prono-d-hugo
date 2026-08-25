import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function MotDePasseOubliePage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-3xl tracking-tight text-ink">
          Mot de passe oublié
        </h1>
        <p className="text-ink-muted">
          Indique ton adresse : tu recevras un lien pour en choisir un nouveau.
        </p>
      </div>

      <Card className="p-6">
        <ForgotPasswordForm />
      </Card>

      <p className="text-center text-[13px] leading-relaxed text-ink-faint">
        Le courriel n&apos;arrive pas ? L&apos;admin du groupe peut réinitialiser
        ton mot de passe depuis l&apos;espace d&apos;administration.
      </p>

      <p className="text-center text-[14px] text-ink-muted">
        <Link href="/connexion" className="font-semibold text-clay underline">
          Retour à la connexion
        </Link>
      </p>
    </div>
  );
}
