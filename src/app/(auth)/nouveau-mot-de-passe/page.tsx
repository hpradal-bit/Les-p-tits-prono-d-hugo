import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { getViewer } from "@/lib/auth/session";
import { NewPasswordForm } from "./new-password-form";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

/**
 * Écran atteint depuis le lien reçu par courriel : `/callback` a échangé le
 * jeton contre une session de récupération avant d'arriver ici.
 */
export default async function NouveauMotDePassePage() {
  const viewer = await getViewer();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-3xl tracking-tight text-ink">
          Nouveau mot de passe
        </h1>
        <p className="text-ink-muted">
          {viewer
            ? "Choisis-en un que tu retiendras jusqu'à la finale."
            : "Ce lien n'est plus valable. Demande-en un nouveau."}
        </p>
      </div>

      {viewer ? (
        <Card className="p-6">
          <NewPasswordForm />
        </Card>
      ) : (
        <p className="text-center text-[14px] text-ink-muted">
          <Link href="/mot-de-passe-oublie" className="font-semibold text-clay underline">
            Recevoir un nouveau lien
          </Link>
        </p>
      )}
    </div>
  );
}
