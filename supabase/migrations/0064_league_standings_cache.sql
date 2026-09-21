-- ============================================================================
-- 0064 — Agrégation du classement en SQL (infrastructure additive)
-- ----------------------------------------------------------------------------
-- Audit technique, point 4 (P1). `src/lib/standings/queries.ts` (928 lignes)
-- l'affirme lui-même en tête de fichier : « les jointures sont volontairement
-- faites en mémoire — 6 joueurs, 91 matchs par saison ». Plus grave que le
-- commentaire ne le dit : `loadStandingsData` interroge `prediction_scores`
-- et `bonus_scores` SANS AUCUN FILTRE au niveau base (ni saison, ni ligue) —
-- elle lit la table entière, pour toutes les saisons et toutes les ligues
-- jamais jouées, et ne filtre qu'ensuite, en JavaScript, ligne par ligne
-- (`fixtures.get(prediction.fixture_id)`, `question.season_id !== season.id`).
-- Ce n'est pas qu'un coût CPU côté Node : c'est un transfert réseau et une
-- lecture disque qui grandissent avec l'historique complet de l'application,
-- à chaque chargement de `/classement`, pour n'importe quelle ligue.
--
-- Cette migration pose le côté SQL de la correction demandée par l'audit :
-- une fonction d'agrégation, plutôt qu'une vue matérialisée classique — le
-- classement dépend de la ligue (le rosier vient de `league_members`, pas de
-- tous les profils actifs), donc une seule vue matérialisée globale ne
-- suffirait pas à elle seule à remplacer `loadStandingsData` sans porter
-- aussi le filtrage par ligue. `refresh_league_standings_cache` calcule les
-- totaux de points (pronostics + bonus + ajustements — les mêmes trois
-- sources que `loadStandingsData`/`engine.ts`, AUCUN changement au moteur de
-- scoring lui-même, règle non négociable n° 2) pour une ligue et une saison
-- données, et les écrit dans `league_standings_cache`.
--
-- Portée délibérément bornée : cette migration livre l'agrégation SQL et la
-- table de cache (« comme demandé : SQL plutôt que Node »), mais ne branche
-- PAS encore `/classement` dessus, et n'ajoute pas non plus d'appel
-- automatique depuis le job de synchro. Rebrancher la page la plus consultée
-- et la plus sensible en confiance de l'application (le classement) sur une
-- nouvelle source de données mérite un test de bout en bout contre la vraie
-- base Supabase — impossible à faire sereinement dans cette session (accès
-- lecture seule au schéma, aucune application de migration en direct
-- possible, cf. contrainte de la remédiation). Détail dans le rapport de
-- remédiation, section « P1, point 4 — livré partiellement ».
-- ============================================================================

create table if not exists league_standings_cache (
  league_id   uuid not null references leagues(id) on delete cascade,
  season_id   uuid not null references seasons(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  points      integer not null default 0,
  computed_at timestamptz not null default now(),
  primary key (league_id, season_id, user_id)
);

create index if not exists idx_league_standings_cache_league_season
  on league_standings_cache (league_id, season_id, points desc);

alter table league_standings_cache enable row level security;
alter table league_standings_cache force row level security;

-- Même repli que le reste du classement : lisible par les membres de la
-- ligue, écrit uniquement par le serveur (service_role, ou la fonction
-- security definer ci-dessous).
create policy league_standings_cache_read on league_standings_cache
  for select to authenticated
  using (public.is_league_member(league_id));

/**
 * Recalcule le total de points de chaque membre d'une ligue, pour une
 * saison, à partir des trois mêmes sources que `loadStandingsData`/
 * `engine.ts` côté Node :
 *   - `prediction_scores.points`, pour les pronostics de la saison ;
 *   - `bonus_scores.points`, pour les questions bonus de la saison ;
 *   - `point_adjustments.delta`, pour les ajustements manuels de la saison.
 *
 * Volontairement SANS reproduire les règles de départage (méthode `engine.ts`
 * — nombre de scores exacts, etc.) : le classement affiché reste calculé et
 * trié côté Node à partir de ces totaux, seule la lecture des trois tables
 * (le vrai coût, aujourd'hui non filtré) est déplacée ici.
 */
create or replace function public.refresh_league_standings_cache(p_league_id uuid, p_season_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into league_standings_cache (league_id, season_id, user_id, points, computed_at)
  select
    p_league_id,
    p_season_id,
    lm.user_id,
    coalesce(ps_total.points, 0) + coalesce(bs_total.points, 0) + coalesce(pa_total.points, 0),
    now()
  from league_members lm
  left join lateral (
    select sum(ps.points) as points
    from prediction_scores ps
    join predictions pr on pr.id = ps.prediction_id
    join fixtures f on f.id = pr.fixture_id
    join rounds r on r.id = f.round_id
    where r.season_id = p_season_id and pr.user_id = lm.user_id
  ) ps_total on true
  left join lateral (
    select sum(bs.points) as points
    from bonus_scores bs
    join bonus_questions bq on bq.id = bs.question_id
    where bq.season_id = p_season_id and bs.user_id = lm.user_id
  ) bs_total on true
  left join lateral (
    select sum(pa.delta) as points
    from point_adjustments pa
    where pa.season_id = p_season_id and pa.user_id = lm.user_id
  ) pa_total on true
  where lm.league_id = p_league_id
  on conflict (league_id, season_id, user_id) do update
    set points = excluded.points, computed_at = excluded.computed_at;
$$;

revoke all on function public.refresh_league_standings_cache(uuid, uuid) from public;
grant execute on function public.refresh_league_standings_cache(uuid, uuid) to service_role;
