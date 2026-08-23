-- ============================================================================
-- LES P'TITS PRONOS D'HUGO — 0016 · PWA & notifications (chantier G)
-- ----------------------------------------------------------------------------
-- Les tables existent déjà (0002). Cette migration les rend exploitables :
--
--   1. `push_subscriptions` apprend à mourir proprement : un abonnement que le
--      service de push refuse (410 Gone) est révoqué, pas oublié.
--   2. `notifications` devient une **file d'attente** et non un simple journal.
--      Trois colonnes suffisent : `dedupe_key` (regroupement + idempotence),
--      `scheduled_for` (report après les heures de silence) et `payload`.
--   3. `notification_settings` porte l'interrupteur « tout couper » et les
--      heures de silence propres au joueur.
--
-- Les trois règles anti-agacement du point 17 de l'audit sont donc appliquées
-- par la base, pas seulement par le code :
--   · regroupement    → index unique sur (user_id, dedupe_key)
--   · heures de silence → scheduled_for + notification_settings
--   · préférences      → notification_preferences + notification_settings
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Abonnements push : santé et nettoyage
-- ---------------------------------------------------------------------------

alter table push_subscriptions
  add column if not exists updated_at    timestamptz not null default now(),
  add column if not exists failure_count integer     not null default 0,
  add column if not exists last_error    text,
  add column if not exists revoked_at    timestamptz;

comment on column push_subscriptions.revoked_at is
  'Renseigné quand le service de push répond 404/410 : l''abonnement est mort, '
  'on le garde une trace de côté plutôt que de le supprimer en silence.';

create index if not exists push_subscriptions_active_idx
  on push_subscriptions (user_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- 2. Réglages de notification propres au joueur
-- ---------------------------------------------------------------------------

-- Une ligne par joueur. `push_enabled = false`, c'est le vrai bouton
-- « tout couper » : il court-circuite toutes les préférences par type.
create table if not exists notification_settings (
  user_id      uuid primary key references profiles(id) on delete cascade,
  push_enabled boolean not null default true,
  quiet_from   time,          -- null = on suit app_settings.notifications.quiet_from
  quiet_to     time,          -- null = on suit app_settings.notifications.quiet_to
  updated_at   timestamptz not null default now()
);

comment on table notification_settings is
  'Réglages globaux de notification par joueur. Absence de ligne = valeurs par défaut.';

alter table notification_preferences
  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 3. `notifications` : une file d'attente
-- ---------------------------------------------------------------------------

alter table notifications
  add column if not exists dedupe_key    text,
  add column if not exists scheduled_for timestamptz not null default now(),
  add column if not exists payload       jsonb       not null default '{}'::jsonb,
  add column if not exists failed_at     timestamptz,
  add column if not exists error         text;

comment on column notifications.dedupe_key is
  'Clé de regroupement. « lock_reminder:<round>:<jour> » couvre les 7 matchs '
  'd''une même journée : l''index unique ci-dessous rend impossible d''envoyer '
  '7 notifications là où une seule suffit. Sert aussi d''idempotence : le '
  'planificateur peut repasser autant de fois qu''il veut.';

comment on column notifications.scheduled_for is
  'Instant d''envoi souhaité. Une notification tombant dans les heures de '
  'silence est reportée au matin plutôt que supprimée.';

create unique index if not exists notifications_dedupe_idx
  on notifications (user_id, dedupe_key) where dedupe_key is not null;

create index if not exists notifications_pending_idx
  on notifications (scheduled_for) where sent_at is null and failed_at is null;

-- ---------------------------------------------------------------------------
-- 4. RLS — mêmes règles que les autres tables personnelles
-- ---------------------------------------------------------------------------

alter table notification_settings enable row level security;
alter table notification_settings force row level security;

drop policy if exists notif_settings_own on notification_settings;
create policy notif_settings_own on notification_settings
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. Réglages applicatifs — aucune donnée métier en dur dans le code
-- ---------------------------------------------------------------------------
-- `notifications.types` est le catalogue des notifications du jeu. Les quatre
-- dernières sont décrites mais pas branchées (`wired: false`) : l'écran des
-- réglages les affiche grisées, le serveur refuse de les émettre. Les activer
-- se fera en basculant un booléen, sans nouvelle migration.

insert into app_settings (key, value) values
  ('notifications.enabled',       'true'::jsonb),
  ('notifications.timezone',      '"Europe/Paris"'::jsonb),
  ('notifications.max_per_day',   '3'::jsonb),
  ('notifications.types', '[
     {"kind":"lock_reminder","emoji":"⏰","label":"Rappel avant verrouillage",
      "description":"Trois heures avant la fermeture, seulement s''il te manque des pronos.",
      "default_enabled":true,"wired":true},
     {"kind":"round_digest","emoji":"🏆","label":"Fin de journée",
      "description":"La journée est terminée : résultats et nouveau classement.",
      "default_enabled":true,"wired":true},
     {"kind":"exact_score","emoji":"🎯","label":"Score exact réussi",
      "description":"Quand quelqu''un décroche un score exact.",
      "default_enabled":true,"wired":false},
     {"kind":"leader_change","emoji":"👑","label":"Changement de leader",
      "description":"Quand la tête du classement change de main.",
      "default_enabled":true,"wired":false},
     {"kind":"overtake","emoji":"🔥","label":"Dépassement direct",
      "description":"Quand un joueur te double au classement.",
      "default_enabled":true,"wired":false},
     {"kind":"bonus_question","emoji":"❓","label":"Nouvelle question bonus",
      "description":"Quand une question bonus s''ouvre.",
      "default_enabled":true,"wired":false}
   ]'::jsonb)
on conflict (key) do nothing;
