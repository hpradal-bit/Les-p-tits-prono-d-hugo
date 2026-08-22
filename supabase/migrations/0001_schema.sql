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
