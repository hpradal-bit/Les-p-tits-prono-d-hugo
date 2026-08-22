-- ============================================================================
-- LES P'TITS PRONOS D'HUGO — Installation complète de la base
-- ----------------------------------------------------------------------------
-- Fichier généré : concaténation des migrations 0001 à 0005, dans l'ordre.
--
-- À exécuter UNE SEULE FOIS, dans Supabase :
--   Dashboard → SQL Editor → New query → coller ce fichier → Run
--
-- Généré le 22/08/2026. Ne pas modifier à la main : régénérer avec
--   ./scripts/build-apply-all.sh
-- ============================================================================


-- ▼▼▼ 0001_schema.sql ▼▼▼

-- ============================================================================
-- LES P'TITS PRONOS D'HUGO — Schéma initial
-- ----------------------------------------------------------------------------
-- Principes appliqués (cf. docs/00-AUDIT.md) :
--   1. Aucune donnée métier en dur : barèmes, tranches, délais, réglages
--      vivent en base et sont modifiables depuis l'espace admin.
--   2. Générique multi-sports : rien ici ne mentionne le rugby.
--   3. Indépendance vis-à-vis des fournisseurs de données : external_refs.
--   4. Les points ne sont jamais écrits par un joueur : ils sont calculés.
--   5. Tout est rejouable : on peut recalculer une saison à l'identique.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ============================================================================
-- 1. IDENTITÉ & GROUPES
-- ============================================================================

create type avatar_kind as enum ('emoji', 'photo', 'club');
create type member_role as enum ('player', 'admin');

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  first_name    text not null,
  display_name  text not null,
  avatar_kind   avatar_kind not null default 'emoji',
  avatar_value  text not null default '🏉',      -- emoji, URL de fichier, ou code club
  favourite_team_id uuid,                        -- FK ajoutée après la table teams
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table profiles is 'Profil applicatif adossé à auth.users. Le rôle vit dans group_members, jamais dans le jeton client.';

create table groups (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  invite_code     citext not null unique,
  active_season_id uuid,                          -- FK ajoutée après la table seasons
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now()
);

create table group_members (
  group_id   uuid not null references groups(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       member_role not null default 'player',
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index on group_members (user_id);

-- ============================================================================
-- 2. RÉFÉRENTIEL SPORTIF (générique)
-- ============================================================================

create type fixture_status as enum (
  'scheduled',   -- à venir
  'live',        -- en cours
  'finished',    -- terminé, score susceptible d'être corrigé
  'official',    -- résultat considéré comme définitif
  'postponed',   -- reporté
  'cancelled'    -- annulé
);

create type round_status as enum ('upcoming', 'open', 'locked', 'settled');
create type season_status as enum ('draft', 'active', 'closed');

create table sports (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,            -- 'rugby', 'football', 'basket'
  name           text not null,
  scoring_family text not null,                   -- module de scoring : 'rugby_union', 'football', …
  draw_possible  boolean not null default true,
  created_at     timestamptz not null default now()
);

create table competitions (
  id         uuid primary key default gen_random_uuid(),
  sport_id   uuid not null references sports(id) on delete restrict,
  code       text not null unique,                -- 'top14', 'prod2', 'ligue1'
  name       text not null,
  country    text,
  logo_url   text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table seasons (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  label          text not null,                   -- '2026/2027'
  starts_on      date not null,
  ends_on        date,
  status         season_status not null default 'draft',
  created_at     timestamptz not null default now(),
  unique (competition_id, label)
);

create table rounds (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references seasons(id) on delete cascade,
  number     integer not null,
  name       text not null,                       -- 'J1'
  starts_at  timestamptz,
  ends_at    timestamptz,
  status     round_status not null default 'upcoming',
  locked_at  timestamptz,                         -- verrouillage effectif (peut être forcé par l'admin)
  settled_at timestamptz,                         -- journée close : classements figés
  created_at timestamptz not null default now(),
  unique (season_id, number)
);

create table teams (
  id             uuid primary key default gen_random_uuid(),
  sport_id       uuid not null references sports(id) on delete restrict,
  name           text not null,
  short_name     text not null,
  code           text not null,                   -- 'ASM', 'ST', 'UBB'
  logo_url       text,
  primary_color  text,                            -- '#FFCC00'
  secondary_color text,
  city           text,
  created_at     timestamptz not null default now(),
  unique (sport_id, code)
);

alter table profiles
  add constraint profiles_favourite_team_fk
  foreign key (favourite_team_id) references teams(id) on delete set null;

create table season_teams (
  season_id uuid not null references seasons(id) on delete cascade,
  team_id   uuid not null references teams(id) on delete cascade,
  primary key (season_id, team_id)
);

create table fixtures (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references rounds(id) on delete cascade,
  home_team_id  uuid not null references teams(id) on delete restrict,
  away_team_id  uuid not null references teams(id) on delete restrict,
  kickoff_at    timestamptz not null,
  status        fixture_status not null default 'scheduled',
  home_score    integer,
  away_score    integer,
  minute        integer,
  locks_at      timestamptz not null,             -- calculé depuis le délai configuré, modifiable par l'admin
  venue         text,
  data_source   text,                             -- 'espn', 'apisports', 'manual'
  last_synced_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint fixtures_distinct_teams check (home_team_id <> away_team_id),
  constraint fixtures_scores_together check (
    (home_score is null and away_score is null) or
    (home_score is not null and away_score is not null)
  )
);

create index on fixtures (round_id);
create index on fixtures (kickoff_at);
create index on fixtures (status);

-- Correspondance entre nos identifiants et ceux des fournisseurs de données.
-- C'est ce qui permet de changer d'API sans rien casser.
create table external_refs (
  id          uuid primary key default gen_random_uuid(),
  provider    text not null,                      -- 'espn', 'apisports', 'thesportsdb'
  entity_type text not null,                      -- 'team', 'fixture', 'competition', 'season'
  entity_id   uuid not null,
  external_id text not null,
  payload     jsonb,
  created_at  timestamptz not null default now(),
  unique (provider, entity_type, external_id),
  unique (provider, entity_type, entity_id)
);

-- ============================================================================
-- 3. RÈGLES DU JEU (versionnées, jamais en dur)
-- ============================================================================

create type match_outcome as enum ('home', 'draw', 'away');

-- Un barème est une version datée. Changer les règles en cours de saison
-- crée une nouvelle version : l'historique n'est pas réécrit.
create table scoring_rulesets (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references seasons(id) on delete cascade,
  version       integer not null,
  label         text,
  effective_from timestamptz not null default now(),
  effective_to  timestamptz,
  rules         jsonb not null,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  unique (season_id, version)
);

comment on column scoring_rulesets.rules is $$
Structure attendue :
{
  "points": { "wrong": 0, "winner": 1, "winner_and_margin": 3, "exact_score": 10 },
  "margin_mode": "buckets",            -- "buckets" | "distance"
  "margin_distance_tolerance": 3,      -- utilisé si margin_mode = "distance"
  "exact_score": {
    "quota": 1,                        -- entier, ou null pour illimité
    "period": "round",                 -- "match" | "round" | "month" | "season"
    "imposed_fixture_ids": []          -- si non vide, seuls ces matchs sont éligibles
  },
  "lock": { "minutes_before_kickoff": 120 },
  "default_prediction": {
    "enabled": true,
    "outcome": "home",                 -- "home" | "median" | "last_choice"
    "margin_bucket": "median"
  }
}
$$;

create table margin_buckets (
  id         uuid primary key default gen_random_uuid(),
  ruleset_id uuid not null references scoring_rulesets(id) on delete cascade,
  position   integer not null,
  min_points integer not null,
  max_points integer,                              -- null = borne haute ouverte (41+)
  label      text not null,
  unique (ruleset_id, position)
);

-- ============================================================================
-- 4. PRONOSTICS & POINTS
-- ============================================================================

create table predictions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  fixture_id        uuid not null references fixtures(id) on delete cascade,
  outcome           match_outcome not null,
  margin_bucket_id  uuid references margin_buckets(id) on delete set null,
  margin_value      integer,                       -- utilisé en mode "distance"
  exact_home_score  integer,
  exact_away_score  integer,
  is_auto           boolean not null default false, -- prono par défaut appliqué au verrouillage
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  locked_at         timestamptz,
  unique (user_id, fixture_id),
  constraint predictions_exact_together check (
    (exact_home_score is null and exact_away_score is null) or
    (exact_home_score is not null and exact_away_score is not null)
  )
);

create index on predictions (fixture_id);

-- Historique de toute modification d'un pronostic (y compris par l'admin).
create table prediction_audit (
  id            uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references predictions(id) on delete cascade,
  before        jsonb,
  after         jsonb,
  changed_by    uuid references profiles(id),
  reason        text,
  created_at    timestamptz not null default now()
);

-- Résultat du calcul. Recalculable à volonté, jamais écrit par un joueur.
create table prediction_scores (
  prediction_id   uuid primary key references predictions(id) on delete cascade,
  points          integer not null default 0,
  breakdown       jsonb not null default '{}'::jsonb,  -- pourquoi ces points
  ruleset_id      uuid references scoring_rulesets(id),
  is_official     boolean not null default false,      -- false = live, true = résultat définitif
  computed_at     timestamptz not null default now()
);

-- Duels, corrections manuelles, bonus admin : tout ce qui n'est pas un prono.
create table point_adjustments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  season_id  uuid not null references seasons(id) on delete cascade,
  round_id   uuid references rounds(id) on delete set null,
  delta      integer not null,
  reason     text not null,
  source     text not null default 'admin',       -- 'admin', 'power:duel', 'bonus_question'
  source_id  uuid,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Classement figé à la clôture d'une journée (le classement live est calculé à la volée).
create table standings_snapshots (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references seasons(id) on delete cascade,
  round_id   uuid references rounds(id) on delete cascade,
  kind       text not null,                       -- 'round' | 'overall' | 'form'
  standings  jsonb not null,
  frozen_at  timestamptz not null default now(),
  unique (season_id, round_id, kind)
);

-- Classement sportif réel de la compétition (indépendant du classement des joueurs).
create table competition_standings (
  id              uuid primary key default gen_random_uuid(),
  season_id       uuid not null references seasons(id) on delete cascade,
  team_id         uuid not null references teams(id) on delete cascade,
  position        integer not null,
  played          integer not null default 0,
  won             integer not null default 0,
  drawn           integer not null default 0,
  lost            integer not null default 0,
  points_for      integer not null default 0,
  points_against  integer not null default 0,
  bonus_offensive integer not null default 0,
  bonus_defensive integer not null default 0,
  points          integer not null default 0,
  updated_at      timestamptz not null default now(),
  unique (season_id, team_id)
);


-- ▼▼▼ 0002_game_systems.sql ▼▼▼

-- ============================================================================
-- LES P'TITS PRONOS D'HUGO — Questions bonus, gamification, social, admin
-- ----------------------------------------------------------------------------
-- Ces tables sont créées dès la vague 0, avant les fonctionnalités qui les
-- utilisent : c'est ce qui permet aux agents des vagues suivantes de
-- travailler en parallèle sans écrire de migrations qui se contredisent.
-- ============================================================================

-- ============================================================================
-- 5. QUESTIONS BONUS
-- ============================================================================

create type question_status as enum ('draft', 'open', 'closed', 'settled');

create table bonus_questions (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references seasons(id) on delete cascade,
  round_id    uuid references rounds(id) on delete cascade,   -- null = question de saison
  kind        text not null,     -- 'single_choice' | 'multi_choice' | 'yes_no'
                                 -- 'numeric_margin' | 'numeric_closest'
                                 -- 'ranking' | 'team' | 'player' | 'free_text'
  prompt      text not null,
  config      jsonb not null default '{}'::jsonb,   -- options, marge, nb de places…
  scoring     jsonb not null default '{}'::jsonb,   -- barème propre à la question
  opens_at    timestamptz,
  closes_at   timestamptz,
  status      question_status not null default 'draft',
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);

create table bonus_answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references bonus_questions(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  answer      jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (question_id, user_id)
);

create table bonus_results (
  question_id   uuid primary key references bonus_questions(id) on delete cascade,
  correct_answer jsonb not null,
  settled_at    timestamptz not null default now(),
  settled_by    uuid references profiles(id)
);

create table bonus_scores (
  question_id uuid not null references bonus_questions(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  points      integer not null default 0,
  breakdown   jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

-- ============================================================================
-- 6. GAMIFICATION : badges, séries, tokens, pouvoirs
-- ============================================================================

create table badges (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  emoji       text not null default '🏅',
  description text,
  rule        jsonb not null,        -- condition évaluée sur le flux d'événements
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table user_badges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  badge_id   uuid not null references badges(id) on delete cascade,
  season_id  uuid references seasons(id) on delete cascade,
  context    jsonb not null default '{}'::jsonb,
  earned_at  timestamptz not null default now(),
  unique (user_id, badge_id, season_id)
);

create table streaks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  season_id     uuid not null references seasons(id) on delete cascade,
  kind          text not null,      -- 'good_prediction', 'bad_prediction', 'podium'…
  current_value integer not null default 0,
  best_value    integer not null default 0,
  updated_at    timestamptz not null default now(),
  unique (user_id, season_id, kind)
);

create type token_status as enum ('available', 'used', 'expired');

create table tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  season_id   uuid not null references seasons(id) on delete cascade,
  period      text not null,        -- 'first_half' | 'second_half' | 'full_season'
  status      token_status not null default 'available',
  granted_at  timestamptz not null default now(),
  used_at     timestamptz
);

create table powers (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,  -- 'duel' | 'joker' | 'spy' | 'oracle' | 'sabotage'
  name       text not null,
  emoji      text not null default '⚡',
  description text,
  config     jsonb not null default '{}'::jsonb,
  is_active  boolean not null default false,
  created_at timestamptz not null default now()
);

create type power_usage_state as enum ('declared', 'accepted', 'resolved', 'cancelled');

create table power_usages (
  id           uuid primary key default gen_random_uuid(),
  token_id     uuid not null unique references tokens(id) on delete restrict,
  power_id     uuid not null references powers(id) on delete restrict,
  initiator_id uuid not null references profiles(id) on delete cascade,
  target_id    uuid references profiles(id) on delete set null,
  round_id     uuid not null references rounds(id) on delete cascade,
  state        power_usage_state not null default 'declared',
  snapshot_before jsonb not null default '{}'::jsonb,
  result       jsonb,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

comment on column power_usages.token_id is 'Unique : un token ne peut jamais être utilisé deux fois. Garanti par la base, pas seulement par le code.';

-- ============================================================================
-- 7. FLUX D'ÉVÉNEMENTS, SOCIAL & NOTIFICATIONS
-- ============================================================================

-- Table en écriture seule. Le fil social, les badges et les notifications
-- sont trois lecteurs de ce même flux : une seule logique, pas trois.
create table events (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,     -- 'exact_score', 'leader_change', 'overtake',
                                -- 'round_settled', 'badge_earned', 'admin_action'…
  season_id  uuid references seasons(id) on delete cascade,
  round_id   uuid references rounds(id) on delete cascade,
  fixture_id uuid references fixtures(id) on delete cascade,
  actor_id   uuid references profiles(id) on delete set null,
  target_id  uuid references profiles(id) on delete set null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index on events (season_id, created_at desc);
create index on events (kind);

create table feed_posts (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  event_id   uuid references events(id) on delete cascade,  -- null = publication humaine
  author_id  uuid references profiles(id) on delete set null,
  body       text,
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);

create index on feed_posts (group_id, created_at desc);

create table reactions (
  post_id    uuid not null references feed_posts(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

create table comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references feed_posts(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  body       text not null,
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  url        text,
  read_at    timestamptz,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);

create index on notifications (user_id, created_at desc);

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  endpoint   text not null unique,
  keys       jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table notification_preferences (
  user_id      uuid not null references profiles(id) on delete cascade,
  kind         text not null,
  channel      text not null default 'push',   -- 'push' | 'in_app'
  is_enabled   boolean not null default true,
  quiet_from   time,                            -- heures de silence
  quiet_to     time,
  primary key (user_id, kind, channel)
);

-- ============================================================================
-- 8. ADMINISTRATION & EXPLOITATION
-- ============================================================================

-- Journal d'administration. Immuable : aucune politique UPDATE ni DELETE
-- n'est accordée, même à l'admin (cf. 0003_rls.sql).
create table admin_actions (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references profiles(id) on delete set null,
  action      text not null,        -- 'fixture.score_corrected', 'points.adjusted'…
  entity_type text,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  reason      text,
  created_at  timestamptz not null default now()
);

create index on admin_actions (created_at desc);

create table sync_runs (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  kind         text not null,       -- 'calendar' | 'live' | 'standings'
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running',   -- 'running' | 'success' | 'failed'
  requests_used integer not null default 0,
  fixtures_updated integer not null default 0,
  error        text
);

create index on sync_runs (started_at desc);

-- Tout réglage applicatif vit ici : aucune valeur métier codée en dur.
create table app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);


-- ▼▼▼ 0003_rls.sql ▼▼▼

-- ============================================================================
-- LES P'TITS PRONOS D'HUGO — Sécurité au niveau des lignes (RLS)
-- ----------------------------------------------------------------------------
-- Règle directrice : la base refuse elle-même de renvoyer les pronostics des
-- autres joueurs avant le verrouillage. Ce n'est pas un masquage à l'écran :
-- même en interrogeant l'API directement, les lignes ne sortent pas.
--
-- Le serveur (clé service_role) contourne RLS : c'est lui, et lui seul, qui
-- écrit les points, les résultats et le journal d'administration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Fonctions utilitaires
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from group_members
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from group_members where user_id = auth.uid()
  );
$$;

-- Un pronostic devient visible de tous une fois le match verrouillé.
create or replace function public.fixture_is_locked(fid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select locks_at <= now() from fixtures where id = fid), false);
$$;

-- ---------------------------------------------------------------------------
-- Activation de RLS sur toutes les tables applicatives
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','groups','group_members',
    'sports','competitions','seasons','rounds','teams','season_teams',
    'fixtures','external_refs',
    'scoring_rulesets','margin_buckets',
    'predictions','prediction_audit','prediction_scores',
    'point_adjustments','standings_snapshots','competition_standings',
    'bonus_questions','bonus_answers','bonus_results','bonus_scores',
    'badges','user_badges','streaks','tokens','powers','power_usages',
    'events','feed_posts','reactions','comments',
    'notifications','push_subscriptions','notification_preferences',
    'admin_actions','sync_runs','app_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Référentiel : lecture pour les membres, écriture réservée au serveur
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'sports','competitions','seasons','rounds','teams','season_teams',
    'fixtures','scoring_rulesets','margin_buckets','standings_snapshots',
    'competition_standings','badges','powers','app_settings','sync_runs'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_member())',
      t || '_read', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Profils & groupes
-- ---------------------------------------------------------------------------

create policy profiles_read on profiles
  for select to authenticated using (public.is_member());

-- Un joueur modifie son profil, jamais son rôle (le rôle vit dans group_members).
create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy groups_read on groups
  for select to authenticated using (public.is_member());

create policy group_members_read on group_members
  for select to authenticated using (public.is_member());

-- ---------------------------------------------------------------------------
-- PRONOSTICS — le cœur de la confidentialité
-- ---------------------------------------------------------------------------

-- Je vois toujours les miens ; ceux des autres uniquement après verrouillage.
create policy predictions_read on predictions
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.fixture_is_locked(fixture_id)
  );

-- Je ne peux créer un pronostic que pour moi, et seulement avant le verrouillage.
create policy predictions_insert_self on predictions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.fixture_is_locked(fixture_id)
    and is_auto = false
  );

-- Je ne peux modifier que le mien, et seulement avant le verrouillage.
create policy predictions_update_self on predictions
  for update to authenticated
  using (user_id = auth.uid() and not public.fixture_is_locked(fixture_id))
  with check (user_id = auth.uid() and not public.fixture_is_locked(fixture_id));

-- Aucune politique DELETE : un pronostic ne se supprime pas côté client.

-- Les points sont visibles de tous, mais écrits uniquement par le serveur.
create policy prediction_scores_read on prediction_scores
  for select to authenticated using (public.is_member());

create policy prediction_audit_read on prediction_audit
  for select to authenticated using (public.is_member());

-- ---------------------------------------------------------------------------
-- Ajustements de points & journal d'administration : lecture publique
-- ---------------------------------------------------------------------------
-- Aucune politique d'écriture, y compris pour l'admin : seul le serveur écrit,
-- et le journal ne peut être ni modifié ni effacé.

create policy point_adjustments_read on point_adjustments
  for select to authenticated using (public.is_member());

create policy admin_actions_read on admin_actions
  for select to authenticated using (public.is_member());

-- ---------------------------------------------------------------------------
-- Questions bonus — même règle de secret que les pronostics
-- ---------------------------------------------------------------------------

create policy bonus_questions_read on bonus_questions
  for select to authenticated
  using (public.is_member() and (status <> 'draft' or public.is_admin()));

create policy bonus_answers_read on bonus_answers
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from bonus_questions q
      where q.id = question_id
        and (q.closes_at is null or q.closes_at <= now() or q.status in ('closed','settled'))
    )
  );

create policy bonus_answers_write on bonus_answers
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from bonus_questions q
      where q.id = question_id
        and q.status = 'open'
        and (q.opens_at is null or q.opens_at <= now())
        and (q.closes_at is null or q.closes_at > now())
    )
  );

create policy bonus_answers_update on bonus_answers
  for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from bonus_questions q
      where q.id = question_id and q.status = 'open'
        and (q.closes_at is null or q.closes_at > now())
    )
  )
  with check (user_id = auth.uid());

create policy bonus_results_read on bonus_results
  for select to authenticated using (public.is_member());

create policy bonus_scores_read on bonus_scores
  for select to authenticated using (public.is_member());

-- ---------------------------------------------------------------------------
-- Gamification : lecture pour tous, attribution par le serveur
-- ---------------------------------------------------------------------------

create policy user_badges_read on user_badges
  for select to authenticated using (public.is_member());

create policy streaks_read on streaks
  for select to authenticated using (public.is_member());

create policy tokens_read on tokens
  for select to authenticated using (public.is_member());

create policy power_usages_read on power_usages
  for select to authenticated using (public.is_member());

-- Déclarer un pouvoir passe par le serveur (vérification du token, de la cible,
-- de la fenêtre de déclaration) : aucune politique d'écriture côté client.

-- ---------------------------------------------------------------------------
-- Social
-- ---------------------------------------------------------------------------

create policy events_read on events
  for select to authenticated using (public.is_member());

create policy feed_posts_read on feed_posts
  for select to authenticated
  using (public.is_member() and (not is_hidden or public.is_admin()));

create policy feed_posts_insert on feed_posts
  for insert to authenticated
  with check (author_id = auth.uid() and event_id is null);

create policy feed_posts_update_own on feed_posts
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy reactions_read on reactions
  for select to authenticated using (public.is_member());

create policy reactions_write on reactions
  for insert to authenticated with check (user_id = auth.uid());

create policy reactions_delete on reactions
  for delete to authenticated using (user_id = auth.uid());

create policy comments_read on comments
  for select to authenticated
  using (public.is_member() and (not is_hidden or public.is_admin()));

create policy comments_write on comments
  for insert to authenticated with check (user_id = auth.uid());

create policy comments_update_own on comments
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Notifications : strictement personnelles
-- ---------------------------------------------------------------------------

create policy notifications_read_own on notifications
  for select to authenticated using (user_id = auth.uid());

create policy notifications_update_own on notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy push_subs_own on push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notif_prefs_own on notification_preferences
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ▼▼▼ 0004_seed_reference.sql ▼▼▼

-- ============================================================================
-- LES P'TITS PRONOS D'HUGO — Données de référence
-- ----------------------------------------------------------------------------
-- Ce ne sont PAS des données en dur : ce sont les valeurs de départ, toutes
-- modifiables depuis l'espace admin. Les équipes et le calendrier ne sont pas
-- ici : ils sont importés depuis le calendrier officiel LNR / l'API.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Sport, compétition, saison
-- ---------------------------------------------------------------------------

insert into sports (code, name, scoring_family, draw_possible)
values ('rugby', 'Rugby à XV', 'rugby_union', true)
on conflict (code) do nothing;

insert into competitions (sport_id, code, name, country)
select id, 'top14', 'Top 14', 'France' from sports where code = 'rugby'
on conflict (code) do nothing;

insert into seasons (competition_id, label, starts_on, ends_on, status)
select id, '2026/2027', date '2026-09-05', date '2027-06-26', 'active'
from competitions where code = 'top14'
on conflict (competition_id, label) do nothing;

-- ---------------------------------------------------------------------------
-- Barème par défaut (version 1)
-- ---------------------------------------------------------------------------

insert into scoring_rulesets (season_id, version, label, rules)
select s.id, 1, 'Barème de départ', jsonb_build_object(
  'points', jsonb_build_object(
    'wrong', 0,
    'winner', 1,
    'winner_and_margin', 3,
    'exact_score', 10
  ),
  'margin_mode', 'buckets',
  'margin_distance_tolerance', 3,
  'exact_score', jsonb_build_object(
    'quota', 1,
    'period', 'round',
    'imposed_fixture_ids', '[]'::jsonb
  ),
  'lock', jsonb_build_object('minutes_before_kickoff', 120),
  'default_prediction', jsonb_build_object(
    'enabled', true,
    'outcome', 'home',
    'margin_bucket', 'median'
  )
)
from seasons s
join competitions c on c.id = s.competition_id
where c.code = 'top14' and s.label = '2026/2027'
on conflict (season_id, version) do nothing;

-- Tranches d'écart par défaut
insert into margin_buckets (ruleset_id, position, min_points, max_points, label)
select r.id, v.position, v.min_points, v.max_points, v.label
from scoring_rulesets r
join seasons s on s.id = r.season_id
join competitions c on c.id = s.competition_id
cross join (values
  (1,  0,  5,   '0-5'),
  (2,  6,  10,  '6-10'),
  (3,  11, 15,  '11-15'),
  (4,  16, 20,  '16-20'),
  (5,  21, 25,  '21-25'),
  (6,  26, 30,  '26-30'),
  (7,  31, 35,  '31-35'),
  (8,  36, 40,  '36-40'),
  (9,  41, null,'41+')
) as v(position, min_points, max_points, label)
where c.code = 'top14' and s.label = '2026/2027' and r.version = 1
on conflict (ruleset_id, position) do nothing;

-- ---------------------------------------------------------------------------
-- Réglages applicatifs (tous modifiables depuis l'admin)
-- ---------------------------------------------------------------------------

insert into app_settings (key, value) values
  ('lock.minutes_before_kickoff', '120'::jsonb),
  ('lock.available_choices',      '[15,30,60,120,180,360,720,1440]'::jsonb),
  ('default_prediction.enabled',  'true'::jsonb),
  ('default_prediction.outcome',  '"home"'::jsonb),
  ('admin_log.public',            'true'::jsonb),
  ('feed.reactions',              '["😂","❤️","🔥","👀","🤡","🏆"]'::jsonb),
  ('colors.wrong',                '"#C0392B"'::jsonb),
  ('colors.winner',               '"#2E7D52"'::jsonb),
  ('colors.perfect',              '"#B08214"'::jsonb),
  ('emoji.wrong',                 '"🔴"'::jsonb),
  ('emoji.winner',                '"🟢"'::jsonb),
  ('emoji.perfect',               '"👌"'::jsonb),
  ('sync.live_interval_minutes',  '5'::jsonb),
  ('sync.idle_interval_minutes',  '60'::jsonb),
  ('sync.match_window_minutes',   '135'::jsonb),
  ('notifications.quiet_from',    '"22:00"'::jsonb),
  ('notifications.quiet_to',      '"08:00"'::jsonb),
  ('notifications.reminder_hours_before_lock', '3'::jsonb),
  ('signup.require_email_confirmation', 'false'::jsonb),
  ('signup.invite_code_required', 'true'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Badges de départ
-- ---------------------------------------------------------------------------

insert into badges (code, name, emoji, description, rule, is_active) values
  ('machine',   'Machine à gagner', '🏆', '5 bons pronostics consécutifs',
   '{"type":"streak","kind":"good_prediction","threshold":5}'::jsonb, true),
  ('en_feu',    'En feu',           '🔥', '10 bons pronostics consécutifs',
   '{"type":"streak","kind":"good_prediction","threshold":10}'::jsonb, true),
  ('sniper',    'Sniper',           '🎯', '5 scores exacts sur la saison',
   '{"type":"count","kind":"exact_score","threshold":5}'::jsonb, true),
  ('spirale',   'Spirale négative', '💀', '5 mauvais pronostics consécutifs',
   '{"type":"streak","kind":"bad_prediction","threshold":5}'::jsonb, true),
  ('patron',    'Patron',           '👑', '5 journées terminées en tête',
   '{"type":"count","kind":"round_won","threshold":5}'::jsonb, true),
  ('remontada', 'Remontada',        '📈', 'La plus forte progression sur une journée',
   '{"type":"superlative","kind":"biggest_climb","scope":"round"}'::jsonb, true)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Pouvoirs (désactivés au départ, activés en vague 2)
-- ---------------------------------------------------------------------------

insert into powers (code, name, emoji, description, config, is_active) values
  ('joker', 'Joker', '🛡️',
   'Double les points obtenus sur un match de la journée.',
   '{"declare_before":"round_lock","resolves_at":"round_settled","multiplier":2}'::jsonb,
   false),
  ('duel', 'Duel', '⚔️',
   'Défie un joueur mieux classé : le gagnant de la journée empoche les points des deux.',
   '{"declare_before":"round_lock","resolves_at":"round_settled","target_rule":"better_ranked_only","tie":"no_transfer"}'::jsonb,
   false),
  ('spy', 'Espion', '🕵️',
   'Révèle le pronostic d''un joueur sur un seul match. La cible est prévenue.',
   '{"declare_before":"round_lock","reveals":1,"notify_target":true}'::jsonb,
   false),
  ('oracle', 'Oracle', '🔮',
   'Obtient un indice avant le verrouillage.',
   '{"declare_before":"round_lock"}'::jsonb,
   false),
  ('sabotage', 'Sabotage', '💣',
   'Pouvoir offensif visant un adversaire.',
   '{"declare_before":"round_lock","visible_to_target":true}'::jsonb,
   false)
on conflict (code) do nothing;


-- ▼▼▼ 0005_top14_2026_2027.sql ▼▼▼

-- ============================================================================
-- LES P'TITS PRONOS D'HUGO — Top 14 2026/2027 : clubs et phase aller
-- ----------------------------------------------------------------------------
-- Source : calendrier officiel LNR (matchs aller, J1 à J13).
--
-- ⚠️ Les jours et horaires précis ne sont pas encore fixés par la LNR : les
-- matchs auront lieu le samedi ou le dimanche. On enregistre donc un coup
-- d'envoi provisoire (samedi 15 h), marqué kickoff_confirmed = false. La
-- synchronisation le remplacera par l'horaire réel dès qu'il sera publié, et
-- recalculera locks_at en conséquence.
-- ============================================================================

alter table fixtures
  add column if not exists kickoff_confirmed boolean not null default false;

comment on column fixtures.kickoff_confirmed is
  'false = horaire provisoire, à confirmer par la synchronisation ou par l''admin.';

-- --- Clubs ------------------------------------------------------------------

insert into teams (sport_id, code, name, short_name, city, primary_color, secondary_color, logo_url)
select s.id, v.code, v.name, v.short_name, v.city, v.c1, v.c2, v.logo
from sports s
cross join (values
  ('BAY', 'Aviron Bayonnais', 'Bayonne', 'Bayonne', '#005BAA', '#FFFFFF', '/logos/bayonne.png'),
  ('UBB', 'Union Bordeaux-Bègles', 'Bordeaux-Bègles', 'Bordeaux', '#8B1A3D', '#1A2A5B', '/logos/bordeaux.png'),
  ('CO', 'Castres Olympique', 'Castres', 'Castres', '#0091D2', '#FFFFFF', '/logos/castres.png'),
  ('ASM', 'ASM Clermont Auvergne', 'Clermont', 'Clermont-Ferrand', '#FFCD00', '#003C71', '/logos/clermont.png'),
  ('SR', 'Stade Rochelais', 'La Rochelle', 'La Rochelle', '#FFD100', '#000000', '/logos/la-rochelle.png'),
  ('LOU', 'LOU Rugby', 'Lyon', 'Lyon', '#E2001A', '#000000', '/logos/lyon.png'),
  ('MHR', 'Montpellier Hérault Rugby', 'Montpellier', 'Montpellier', '#0069B4', '#FFFFFF', '/logos/montpellier.png'),
  ('SP', 'Section Paloise', 'Pau', 'Pau', '#009640', '#FFFFFF', '/logos/pau.png'),
  ('USAP', 'USA Perpignan', 'Perpignan', 'Perpignan', '#C8102E', '#FFD100', '/logos/perpignan.png'),
  ('R92', 'Racing 92', 'Racing 92', 'Nanterre', '#009FE3', '#FFFFFF', '/logos/racing-92.png'),
  ('SFP', 'Stade Français Paris', 'Stade Français', 'Paris', '#E5007D', '#003DA5', '/logos/stade-francais.png'),
  ('RCT', 'RC Toulon', 'Toulon', 'Toulon', '#D6001C', '#000000', '/logos/toulon.png'),
  ('ST', 'Stade Toulousain', 'Toulouse', 'Toulouse', '#E30613', '#000000', '/logos/toulouse.png'),
  ('RCV', 'RC Vannes', 'Vannes', 'Vannes', '#1A1A1A', '#FFFFFF', '/logos/vannes.png')
) as v(code, name, short_name, city, c1, c2, logo)
where s.code = 'rugby'
on conflict (sport_id, code) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  city = excluded.city,
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  logo_url = excluded.logo_url;

-- --- Inscription des clubs dans la saison ------------------------------------
insert into season_teams (season_id, team_id)
select se.id, t.id
from seasons se
join competitions c on c.id = se.competition_id
join teams t on t.sport_id = c.sport_id
where c.code = 'top14' and se.label = '2026/2027'
on conflict do nothing;

-- --- Journées ----------------------------------------------------------------

insert into rounds (season_id, number, name, starts_at, ends_at, status)
select se.id, v.number, v.name,
       timezone('Europe/Paris', (v.saturday || ' 00:00')::timestamp),
       timezone('Europe/Paris', (v.saturday || ' 23:59')::timestamp) + interval '1 day',
       'upcoming'
from seasons se
join competitions c on c.id = se.competition_id
cross join (values
  (1, 'J1', '2026-09-05'),
  (2, 'J2', '2026-09-12'),
  (3, 'J3', '2026-09-19'),
  (4, 'J4', '2026-09-26'),
  (5, 'J5', '2026-10-03'),
  (6, 'J6', '2026-10-10'),
  (7, 'J7', '2026-10-24'),
  (8, 'J8', '2026-10-31'),
  (9, 'J9', '2026-11-07'),
  (10, 'J10', '2026-11-28'),
  (11, 'J11', '2026-12-05'),
  (12, 'J12', '2026-12-19'),
  (13, 'J13 · Boxing Day', '2026-12-26')
) as v(number, name, saturday)
where c.code = 'top14' and se.label = '2026/2027'
on conflict (season_id, number) do nothing;

-- --- Matchs (phase aller) -----------------------------------------------------

with cfg as (
  select coalesce((select (value #>> '{}')::int from app_settings
                   where key = 'lock.minutes_before_kickoff'), 120) as lock_minutes
)
insert into fixtures (round_id, home_team_id, away_team_id, kickoff_at, locks_at, status, kickoff_confirmed)
select r.id, h.id, a.id,
       timezone('Europe/Paris', (v.saturday || ' 15:00')::timestamp),
       timezone('Europe/Paris', (v.saturday || ' 15:00')::timestamp)
         - make_interval(mins => cfg.lock_minutes),
       'scheduled', false
from cfg
cross join (values
  (1, 'BAY', 'RCT', '2026-09-05'),
  (1, 'UBB', 'R92', '2026-09-05'),
  (1, 'CO', 'RCV', '2026-09-05'),
  (1, 'SR', 'ST', '2026-09-05'),
  (1, 'LOU', 'ASM', '2026-09-05'),
  (1, 'MHR', 'SP', '2026-09-05'),
  (1, 'SFP', 'USAP', '2026-09-05'),
  (2, 'ASM', 'SFP', '2026-09-12'),
  (2, 'SP', 'BAY', '2026-09-12'),
  (2, 'USAP', 'CO', '2026-09-12'),
  (2, 'R92', 'LOU', '2026-09-12'),
  (2, 'RCT', 'SR', '2026-09-12'),
  (2, 'ST', 'UBB', '2026-09-12'),
  (2, 'RCV', 'MHR', '2026-09-12'),
  (3, 'BAY', 'ASM', '2026-09-19'),
  (3, 'UBB', 'SFP', '2026-09-19'),
  (3, 'CO', 'RCT', '2026-09-19'),
  (3, 'SR', 'R92', '2026-09-19'),
  (3, 'LOU', 'SP', '2026-09-19'),
  (3, 'MHR', 'USAP', '2026-09-19'),
  (3, 'RCV', 'ST', '2026-09-19'),
  (4, 'ASM', 'CO', '2026-09-26'),
  (4, 'SFP', 'LOU', '2026-09-26'),
  (4, 'SP', 'SR', '2026-09-26'),
  (4, 'USAP', 'UBB', '2026-09-26'),
  (4, 'R92', 'BAY', '2026-09-26'),
  (4, 'RCT', 'RCV', '2026-09-26'),
  (4, 'ST', 'MHR', '2026-09-26'),
  (5, 'BAY', 'SFP', '2026-10-03'),
  (5, 'UBB', 'LOU', '2026-10-03'),
  (5, 'CO', 'ST', '2026-10-03'),
  (5, 'SR', 'ASM', '2026-10-03'),
  (5, 'MHR', 'RCT', '2026-10-03'),
  (5, 'R92', 'USAP', '2026-10-03'),
  (5, 'RCV', 'SP', '2026-10-03'),
  (6, 'ASM', 'UBB', '2026-10-10'),
  (6, 'LOU', 'SR', '2026-10-10'),
  (6, 'SFP', 'MHR', '2026-10-10'),
  (6, 'SP', 'CO', '2026-10-10'),
  (6, 'USAP', 'RCV', '2026-10-10'),
  (6, 'RCT', 'R92', '2026-10-10'),
  (6, 'ST', 'BAY', '2026-10-10'),
  (7, 'BAY', 'LOU', '2026-10-24'),
  (7, 'CO', 'SFP', '2026-10-24'),
  (7, 'SR', 'UBB', '2026-10-24'),
  (7, 'R92', 'MHR', '2026-10-24'),
  (7, 'RCT', 'SP', '2026-10-24'),
  (7, 'ST', 'USAP', '2026-10-24'),
  (7, 'RCV', 'ASM', '2026-10-24'),
  (8, 'UBB', 'BAY', '2026-10-31'),
  (8, 'ASM', 'R92', '2026-10-31'),
  (8, 'LOU', 'RCV', '2026-10-31'),
  (8, 'MHR', 'CO', '2026-10-31'),
  (8, 'SFP', 'SR', '2026-10-31'),
  (8, 'SP', 'ST', '2026-10-31'),
  (8, 'USAP', 'RCT', '2026-10-31'),
  (9, 'CO', 'R92', '2026-11-07'),
  (9, 'SR', 'BAY', '2026-11-07'),
  (9, 'MHR', 'LOU', '2026-11-07'),
  (9, 'SP', 'USAP', '2026-11-07'),
  (9, 'RCT', 'SFP', '2026-11-07'),
  (9, 'ST', 'ASM', '2026-11-07'),
  (9, 'RCV', 'UBB', '2026-11-07'),
  (10, 'BAY', 'CO', '2026-11-28'),
  (10, 'UBB', 'MHR', '2026-11-28'),
  (10, 'ASM', 'RCT', '2026-11-28'),
  (10, 'SR', 'USAP', '2026-11-28'),
  (10, 'LOU', 'ST', '2026-11-28'),
  (10, 'SFP', 'RCV', '2026-11-28'),
  (10, 'R92', 'SP', '2026-11-28'),
  (11, 'CO', 'LOU', '2026-12-05'),
  (11, 'MHR', 'SR', '2026-12-05'),
  (11, 'SP', 'SFP', '2026-12-05'),
  (11, 'USAP', 'ASM', '2026-12-05'),
  (11, 'RCT', 'UBB', '2026-12-05'),
  (11, 'ST', 'R92', '2026-12-05'),
  (11, 'RCV', 'BAY', '2026-12-05'),
  (12, 'BAY', 'USAP', '2026-12-19'),
  (12, 'UBB', 'SP', '2026-12-19'),
  (12, 'ASM', 'MHR', '2026-12-19'),
  (12, 'SR', 'CO', '2026-12-19'),
  (12, 'LOU', 'RCT', '2026-12-19'),
  (12, 'SFP', 'ST', '2026-12-19'),
  (12, 'R92', 'RCV', '2026-12-19'),
  (13, 'CO', 'UBB', '2026-12-26'),
  (13, 'MHR', 'BAY', '2026-12-26'),
  (13, 'SP', 'ASM', '2026-12-26'),
  (13, 'USAP', 'LOU', '2026-12-26'),
  (13, 'R92', 'SFP', '2026-12-26'),
  (13, 'ST', 'RCT', '2026-12-26'),
  (13, 'RCV', 'SR', '2026-12-26')
) as v(round_number, home_code, away_code, saturday)
join seasons se on se.label = '2026/2027'
join competitions c on c.id = se.competition_id and c.code = 'top14'
join rounds r on r.season_id = se.id and r.number = v.round_number
join teams h on h.code = v.home_code and h.sport_id = c.sport_id
join teams a on a.code = v.away_code and a.sport_id = c.sport_id
where not exists (
  select 1 from fixtures f
  where f.round_id = r.id and f.home_team_id = h.id and f.away_team_id = a.id
);

