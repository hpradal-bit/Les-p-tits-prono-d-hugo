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
