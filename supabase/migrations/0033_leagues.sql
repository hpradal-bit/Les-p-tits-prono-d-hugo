-- ============================================================================
-- 0033 — Ligues privées (premier incrément)
-- ----------------------------------------------------------------------------
-- Jusqu'ici, toute la sécurité de l'application tenait sur une seule question :
-- « fait-il partie de l'unique groupe ? » (`is_member()`). C'était vrai pour
-- 6 amis sur une compétition. Ça cesse d'être vrai dès qu'il existe plusieurs
-- ligues indépendantes : un membre de la ligue A ne doit ni voir le profil, ni
-- voir le pronostic verrouillé d'un membre de la ligue B avec qui il ne
-- partage aucune ligue.
--
-- Cette migration pose les fondations — les tables `leagues`/`league_members`,
-- et referme les deux politiques RLS les plus sensibles (profils, pronostics)
-- sur le partage d'une ligue plutôt que sur l'appartenance au groupe unique.
--
-- Ce qu'elle NE fait PAS encore (chantier suivant, périmètre déjà documenté
-- dans le plan) : le fil social, les badges/séries, les crédits/pouvoirs et
-- la navigation `/journee` `/classement` restent, pour l'instant, scopés
-- comme avant (par groupe / par saison entière). Rien n'est cassé : avec un
-- seul compte réel aujourd'hui, ce resserrement des deux politiques les plus
-- sensibles est invisible en pratique, et pose la base pour la suite.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists leagues (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete restrict,
  name           text not null,
  logo_url       text,
  slogan         text,
  join_key       citext not null unique,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now()
);
-- Pas de unique(competition_id) : plusieurs ligues indépendantes peuvent
-- partager une compétition (ex. deux ligues Top 14 distinctes).

create table if not exists league_members (
  league_id  uuid not null references leagues(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       member_role not null default 'player',  -- enum déjà existant (player|admin)
  joined_at  timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index if not exists idx_league_members_user_id on league_members (user_id);

-- ---------------------------------------------------------------------------
-- 2. Fonctions RLS — mêmes conventions que is_member()/is_admin() (0003_rls.sql)
-- ---------------------------------------------------------------------------

create or replace function public.is_league_member(lid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from league_members where league_id = lid and user_id = auth.uid()
  );
$$;

/** Deux comptes partagent-ils au moins une ligue ? Base de la visibilité des profils. */
create or replace function public.shares_any_league(other_user uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from league_members mine
    join league_members theirs on theirs.league_id = mine.league_id
    where mine.user_id = auth.uid() and theirs.user_id = other_user
  );
$$;

/**
 * Deux comptes partagent-ils une ligue dont la compétition couvre ce match ?
 * Base de la visibilité des pronostics une fois le match verrouillé : voir le
 * pronostic d'un coéquipier de ligue, jamais celui d'un inconnu d'une autre ligue.
 */
create or replace function public.shares_league_for_fixture(other_user uuid, fid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from league_members mine
    join league_members theirs on theirs.league_id = mine.league_id
    join leagues l on l.id = mine.league_id
    join fixtures f on f.id = fid
    join rounds r on r.id = f.round_id
    join seasons se on se.id = r.season_id
    where mine.user_id = auth.uid()
      and theirs.user_id = other_user
      and se.competition_id = l.competition_id
  );
$$;

revoke all on function public.is_league_member(uuid) from public;
revoke all on function public.shares_any_league(uuid) from public;
revoke all on function public.shares_league_for_fixture(uuid, uuid) from public;
grant execute on function public.is_league_member(uuid) to authenticated;
grant execute on function public.shares_any_league(uuid) to authenticated;
grant execute on function public.shares_league_for_fixture(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

alter table leagues enable row level security;
alter table league_members enable row level security;

-- Lecture réservée aux membres de CETTE ligue. Aucune écriture cliente : comme
-- `groups` aujourd'hui, tout passe par le client de service dans des actions
-- serveur (créer une ligue, la rejoindre, en changer le nom/la clé).
create policy leagues_read on leagues
  for select to authenticated using (public.is_league_member(id));

create policy league_members_read on league_members
  for select to authenticated using (public.is_league_member(league_id));

-- On ne voit que soi-même et ses coéquipiers de ligue — remplace is_member().
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_any_league(id));

-- Après verrouillage, on ne voit que le pronostic d'un coéquipier de ligue —
-- remplace le fixture_is_locked(fixture_id) global. C'est la politique la
-- plus sensible du chantier (règle n° 3 du projet).
drop policy if exists predictions_read on predictions;
create policy predictions_read on predictions
  for select to authenticated
  using (
    user_id = auth.uid()
    or (public.fixture_is_locked(fixture_id) and public.shares_league_for_fixture(user_id, fixture_id))
  );

-- ---------------------------------------------------------------------------
-- 4. Catalogue décoratif — sports/compétitions à venir, non jouables
-- ---------------------------------------------------------------------------
-- Purement visuel dans le catalogue « Rejoindre une ligue » : is_active=false,
-- aucune saison, donc rien de cliquable derrière. Même style que
-- 0004_seed_reference.sql / 0025_prod2.sql (sport puis compétition, idempotent).

insert into sports (code, name, scoring_family, draw_possible)
values
  ('football', 'Football', 'football', true),
  ('basketball', 'Basketball', 'basketball', false),
  ('tennis', 'Tennis', 'tennis', false),
  ('cyclisme', 'Cyclisme', 'cyclisme', false)
on conflict (code) do nothing;

insert into competitions (sport_id, code, name, country, is_active)
select s.id, c.code, c.name, c.country, false
from (values
  ('football', 'ligue1', 'Ligue 1', 'France'),
  ('football', 'ligue2', 'Ligue 2', 'France'),
  ('football', 'premier_league', 'Premier League', 'Angleterre'),
  ('football', 'champions_league', 'Champions League', null),
  ('rugby', 'champions_cup', 'Champions Cup', null),
  ('rugby', 'six_nations', 'Six Nations', null),
  ('basketball', 'nba', 'NBA', 'États-Unis'),
  ('basketball', 'euroleague', 'EuroLeague', null),
  ('basketball', 'betclic_elite', 'Betclic Élite', 'France'),
  ('tennis', 'roland_garros', 'Roland-Garros', 'France'),
  ('tennis', 'wimbledon', 'Wimbledon', 'Angleterre'),
  ('tennis', 'us_open', 'US Open', 'États-Unis'),
  ('cyclisme', 'tour_de_france', 'Tour de France', 'France'),
  ('cyclisme', 'giro', 'Giro d''Italia', 'Italie'),
  ('cyclisme', 'vuelta', 'Vuelta a España', 'Espagne')
) as c(sport_code, code, name, country)
join sports s on s.code = c.sport_code
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Migration des données existantes
-- ---------------------------------------------------------------------------
-- Un seul groupe réel existe aujourd'hui (les 6 amis). Il devient deux ligues,
-- une par compétition jouable, avec les mêmes membres et les mêmes rôles.
-- Clés provisoires, lisibles, régénérables ensuite depuis l'espace admin de
-- la ligue — même logique que 'TOP14-2026' pour groups.invite_code en 0010.

insert into leagues (competition_id, name, join_key, created_by)
select c.id, 'Prono des copains', 'COPAINS', gm.user_id
from competitions c
join group_members gm on gm.role = 'admin'
where c.code = 'top14'
order by gm.joined_at
limit 1
on conflict (join_key) do nothing;

insert into leagues (competition_id, name, join_key, created_by)
select c.id, 'Ligue test', 'PRODTEST', gm.user_id
from competitions c
join group_members gm on gm.role = 'admin'
where c.code = 'prod2'
order by gm.joined_at
limit 1
on conflict (join_key) do nothing;

-- Tous les membres actuels du groupe rejoignent les deux ligues : c'est
-- exactement ce qu'ils pouvaient déjà voir avant cette migration.
insert into league_members (league_id, user_id, role)
select l.id, gm.user_id, gm.role
from leagues l
cross join group_members gm
where l.join_key in ('COPAINS', 'PRODTEST')
on conflict (league_id, user_id) do nothing;
