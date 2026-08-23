import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card, Label } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";
import { requireViewer } from "@/lib/auth/session";
import { loadAvatarPolicy, loadClubAvatars } from "@/lib/auth/avatar-policy";
import { Avatar } from "../_components/avatar";
import { AvatarPicker } from "./avatar-picker";
import { IdentityForm } from "./identity-form";

export const metadata: Metadata = { title: "Mon compte" };

export default async function MonComptePage({
  searchParams,
}: {
  searchParams: Promise<{ motdepasse?: string }>;
}) {
  const viewer = await requireViewer();
  const { motdepasse } = await searchParams;

  const sb = await createClient();
  const [policy, clubs] = await Promise.all([loadAvatarPolicy(sb), loadClubAvatars(sb)]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar kind={viewer.avatarKind} value={viewer.avatarValue} clubs={clubs} size={64} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="truncate font-display text-2xl tracking-tight text-ink">
            {viewer.displayName}
          </h1>
          <p className="truncate text-[14px] text-ink-muted">{viewer.email}</p>
        </div>
      </div>

      {motdepasse ? (
        <p
          role="status"
          className="rounded-xl bg-winner-soft px-3.5 py-2.5 text-[14px] font-medium text-winner"
        >
          Mot de passe changé.
        </p>
      ) : null}

      <Card className="flex flex-col gap-4 p-6">
        <Label>Identité</Label>
        <IdentityForm firstName={viewer.firstName} displayName={viewer.displayName} />
      </Card>

      <Card className="flex flex-col gap-4 p-6">
        <Label>Avatar</Label>
        <AvatarPicker
          emojis={policy.emojis}
          clubs={clubs}
          currentKind={viewer.avatarKind}
          currentValue={viewer.avatarValue}
          maxBytes={policy.maxBytes}
          allowedMime={policy.allowedMime}
        />
      </Card>

      <Card className="flex flex-col gap-4 p-6">
        <Label>Sécurité</Label>
        <p className="text-[14px] text-ink-muted">
          Pour changer de mot de passe, demande un lien par courriel.
        </p>
        <Link
          href="/mot-de-passe-oublie"
          className="self-start text-[14px] font-semibold text-clay underline"
        >
          Changer mon mot de passe
        </Link>
      </Card>

      <form action={signOut}>
        <Button type="submit" variant="ghost" className="w-full">
          Se déconnecter
        </Button>
      </form>
    </div>
  );
}
