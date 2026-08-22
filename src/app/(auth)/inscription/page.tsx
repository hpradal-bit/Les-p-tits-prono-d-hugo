import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Inscription" };

export default async function InscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  // Le lien d'invitation porte le code : /inscription?code=XXXX
  const { code } = await searchParams;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
          Rejoindre le groupe
        </h1>
        <p className="text-ink-muted">
          Six joueurs, une saison de Top 14, et un classement dont on reparlera
          longtemps.
        </p>
      </div>

      <Card className="p-6">
        <SignUpForm defaultInviteCode={code ?? ""} />
      </Card>

      <p className="text-center text-[14px] text-ink-muted">
        Tu as déjà un compte ?{" "}
        <Link href="/connexion" className="font-semibold text-pine underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
