import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ inscrit?: string; suite?: string }>;
}) {
  const { inscrit, suite } = await searchParams;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
          Content de te revoir
        </h1>
        <p className="text-ink-muted">La J1, c&apos;est le samedi 5 septembre 2026.</p>
      </div>

      {inscrit ? (
        <p
          role="status"
          className="rounded-xl bg-winner-soft px-3.5 py-2.5 text-[14px] font-medium text-winner"
        >
          Ton compte est créé. Connecte-toi pour entrer dans le vestiaire.
        </p>
      ) : null}

      <Card className="p-6">
        <SignInForm suite={suite} />
      </Card>

      <div className="flex flex-col gap-2 text-center text-[14px]">
        <Link href="/mot-de-passe-oublie" className="font-medium text-ink-muted underline">
          Mot de passe oublié ?
        </Link>
        <p className="text-ink-muted">
          Tu as un code d&apos;invitation ?{" "}
          <Link href="/inscription" className="font-semibold text-pine underline">
            Créer un compte
          </Link>
        </p>
      </div>
    </div>
  );
}
