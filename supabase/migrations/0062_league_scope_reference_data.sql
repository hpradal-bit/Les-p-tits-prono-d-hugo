-- ============================================================================
-- 0062 — Ligues privées (sixième incrément) : référentiel sportif, bonus,
-- journal d'administration
-- ----------------------------------------------------------------------------
-- Audit technique, point 1 (priorité P0). Les migrations 0033-0036 ont
-- resserré `profiles`, `predictions`, `user_badges`, `streaks`, `tokens`,
-- `power_usages`, `bonus_scores`, `feed_posts`, `reactions`, `comments` sur
-- `league_members`. Tout le reste — calendrier, résultats, barème, bonus,
-- journal d'administration, réglages, journal de synchro — restait gardé par
-- `is_member()`, le vieux contrôle « fait-il partie de l'unique groupe ? »
-- hérité d'avant les ligues. Tant qu'un seul groupe réel existe, personne ne
-- le remarque ; dès qu'une deuxième ligue existe avec des membres différents,
-- n'importe quel membre d'une ligue quelconque peut lire le calendrier, les
-- résultats, les questions bonus et le journal d'administration de toutes
-- les autres ligues.
--
-- Deux familles de tables, deux traitements différents :
--
--   1. Le référentiel sportif partagé (seasons/rounds/fixtures/
--      scoring_rulesets/margin_buckets/standings_snapshots/
--      competition_standings/point_adjustments/bonus_questions/
--      bonus_answers/bonus_results) porte, directement ou par une chaîne de
--      clés étrangères fiable, un `season_id` — donc une compétition. Une
--      compétition peut être jouée par plusieurs ligues indépendantes
--      (`leagues.competition_id` n'est pas unique, 0033) : on réutilise donc
--      `league_of_season`/`league_of_round`, déjà posées en 0035 pour
--      badges/séries/jetons/pouvoirs, plutôt que d'ajouter une colonne
--      `league_id` qui romprait le modèle « une compétition, plusieurs
--      ligues ». Ce sont exactement les fonctions demandées par l'audit
--      (« league_id, ou une colonne dérivable de façon fiable »).
--
--   2. Le catalogue global (sports/teams/competitions/badges/powers/
--      app_settings) ne porte, par nature, aucune notion de ligue : ce sont
--      des définitions partagées par toute l'application (le nom d'un sport,
--      les couleurs d'un club, le catalogue des badges). Rien de sensible
--      n'y est stocké (aucune clé, aucun secret — grep exhaustif de
--      `process.env` dans le code, jamais dans `app_settings`). Le repli
--      choisi n'est donc plus « appartenir à l'unique groupe historique »
--      mais « être connecté » : ça retire la dépendance à `group_members`
--      partout (le but de ce chantier), sans rien retirer d'utile — ces
--      tables doivent d'ailleurs rester lisibles par un joueur qui n'est
--      encore membre d'AUCUNE ligue, pour les écrans « Créer une ligue » /
--      « Rejoindre une ligue » (`loadCatalogue`, `loadJoinableCompetitions`,
--      `src/lib/leagues/queries.ts`), ce qu'`is_member()` cassait déjà en
--      pratique pour un joueur qui n'aurait jamais rejoint le groupe unique.
--
--   3. `admin_actions` et `sync_runs` ne portent aujourd'hui aucune colonne
--      qui remonte à une saison ou une ligue (journal générique, actions
--      globales incluses). `admin_actions` reçoit une colonne `league_id`
--      nullable, additive : renseignée pour les actions qui portent sur une
--      ligue précise (résultat, barème, bonus, ajustement — exactement les
--      actions désormais vérifiées par `requireAdmin(leagueId)`, voir le
--      correctif du point 2 côté application), laissée `null` pour les
--      actions réellement globales (réglages, joueurs, synchronisation). La
--      lecture se resserre : une entrée liée à une ligue n'est visible que
--      des membres de CETTE ligue (elle ne l'était pas du tout avant — fuite
--      corrigée) ; une entrée globale reste visible des seuls administrateurs
--      (avant : de tout le monde). `sync_runs` n'a pas d'équivalent fiable
--      (une synchronisation touche potentiellement plusieurs compétitions à
--      la fois) : elle n'est pas une donnée de joueur, seulement un journal
--      d'exploitation — sa lecture se resserre aux seuls administrateurs de
--      ligue, au lieu de tout le groupe historique.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Fonction utilitaire — utilisée dès la section 2 (bonus)
-- ---------------------------------------------------------------------------

/** Un compte est-il admin d'une ligue précise ? Voir aussi is_league_member(). */
create or replace function public.is_admin_of_league(lid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from league_members
    where league_id = lid and user_id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin_of_league(uuid) from public;
grant execute on function public.is_admin_of_league(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Le référentiel sportif partagé — via league_of_season / league_of_round
-- ---------------------------------------------------------------------------

drop policy if exists seasons_read on seasons;
create policy seasons_read on seasons
  for select to authenticated
  using (public.is_league_member(public.league_of_season(id)));

drop policy if exists rounds_read on rounds;
create policy rounds_read on rounds
  for select to authenticated
  using (public.is_league_member(public.league_of_round(id)));

drop policy if exists fixtures_read on fixtures;
create policy fixtures_read on fixtures
  for select to authenticated
  using (public.is_league_member(public.league_of_round(round_id)));

drop policy if exists scoring_rulesets_read on scoring_rulesets;
create policy scoring_rulesets_read on scoring_rulesets
  for select to authenticated
  using (public.is_league_member(public.league_of_season(season_id)));

drop policy if exists margin_buckets_read on margin_buckets;
create policy margin_buckets_read on margin_buckets
  for select to authenticated
  using (
    exists (
      select 1 from scoring_rulesets sr
      where sr.id = margin_buckets.ruleset_id
        and public.is_league_member(public.league_of_season(sr.season_id))
    )
  );

drop policy if exists standings_snapshots_read on standings_snapshots;
create policy standings_snapshots_read on standings_snapshots
  for select to authenticated
  using (public.is_league_member(public.league_of_season(season_id)));

drop policy if exists competition_standings_read on competition_standings;
create policy competition_standings_read on competition_standings
  for select to authenticated
  using (public.is_league_member(public.league_of_season(season_id)));

drop policy if exists point_adjustments_read on point_adjustments;
create policy point_adjustments_read on point_adjustments
  for select to authenticated
  using (public.is_league_member(public.league_of_season(season_id)));

-- ---------------------------------------------------------------------------
-- 2. Bonus — même route que bonus_scores (déjà cloisonné en 0035)
-- ---------------------------------------------------------------------------

drop policy if exists bonus_questions_read on bonus_questions;
create policy bonus_questions_read on bonus_questions
  for select to authenticated
  using (
    public.is_league_member(public.league_of_season(season_id))
    and (status <> 'draft' or public.is_admin() or public.is_admin_of_league(public.league_of_season(season_id)))
  );

drop policy if exists bonus_results_read on bonus_results;
create policy bonus_results_read on bonus_results
  for select to authenticated
  using (
    exists (
      select 1 from bonus_questions q
      where q.id = bonus_results.question_id
        and public.is_league_member(public.league_of_season(q.season_id))
    )
  );

-- bonus_answers_read/write/update ne vérifiaient jusqu'ici AUCUNE
-- appartenance (ni `is_member()`, ni ligue) : seul le statut de la question
-- comptait. N'importe quel compte authentifié — même hors de toute ligue —
-- pouvait donc lire les réponses des autres une fois la question fermée, ou
-- répondre à une question d'une ligue à laquelle il n'appartient pas. Ce
-- n'est pas propre au multi-ligue : c'est corrigé ici parce que c'est la
-- même famille de policies.
drop policy if exists bonus_answers_read on bonus_answers;
create policy bonus_answers_read on bonus_answers
  for select to authenticated
  using (
    exists (
      select 1 from bonus_questions q
      where q.id = bonus_answers.question_id
        and public.is_league_member(public.league_of_season(q.season_id))
        and (
          bonus_answers.user_id = (select auth.uid())
          or q.closes_at is null
          or q.closes_at <= now()
          or q.status in ('closed', 'settled')
        )
    )
  );

drop policy if exists bonus_answers_write on bonus_answers;
create policy bonus_answers_write on bonus_answers
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from bonus_questions q
      where q.id = question_id
        and q.status = 'open'
        and public.is_league_member(public.league_of_season(q.season_id))
        and (q.opens_at is null or q.opens_at <= now())
        and (q.closes_at is null or q.closes_at > now())
    )
  );

drop policy if exists bonus_answers_update on bonus_answers;
create policy bonus_answers_update on bonus_answers
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from bonus_questions q
      where q.id = question_id and q.status = 'open'
        and public.is_league_member(public.league_of_season(q.season_id))
        and (q.closes_at is null or q.closes_at > now())
    )
  )
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Catalogue global — non sensible, lisible par tout compte authentifié
-- ---------------------------------------------------------------------------

drop policy if exists sports_read on sports;
create policy sports_read on sports
  for select to authenticated using (true);

drop policy if exists competitions_read on competitions;
create policy competitions_read on competitions
  for select to authenticated using (true);

drop policy if exists teams_read on teams;
create policy teams_read on teams
  for select to authenticated using (true);

drop policy if exists badges_read on badges;
create policy badges_read on badges
  for select to authenticated using (true);

drop policy if exists powers_read on powers;
create policy powers_read on powers
  for select to authenticated using (true);

drop policy if exists app_settings_read on app_settings;
create policy app_settings_read on app_settings
  for select to authenticated using (true);

-- season_teams (l'effectif d'une saison) porte un season_id direct : même
-- route que le reste du référentiel, plutôt que le repli « tout compte
-- authentifié » du catalogue global ci-dessus.
drop policy if exists season_teams_read on season_teams;
create policy season_teams_read on season_teams
  for select to authenticated
  using (public.is_league_member(public.league_of_season(season_id)));

-- ---------------------------------------------------------------------------
-- 4. admin_actions — colonne league_id (additive), lecture resserrée
-- ---------------------------------------------------------------------------

alter table admin_actions add column if not exists league_id uuid references leagues(id) on delete set null;
create index if not exists idx_admin_actions_league_id on admin_actions (league_id);

-- Avant : is_member() — tout le groupe historique lisait le journal complet.
-- Après : une entrée liée à une ligue n'est visible que de CETTE ligue ; une
-- entrée globale (league_id null : réglages, joueurs, synchronisation) reste
-- réservée aux administrateurs — jamais à tout le monde comme avant.
drop policy if exists admin_actions_read on admin_actions;
create policy admin_actions_read on admin_actions
  for select to authenticated
  using (
    case
      when league_id is not null then public.is_league_member(league_id)
      else public.is_admin() or exists (
        select 1 from league_members where user_id = (select auth.uid()) and role = 'admin'
      )
    end
  );

-- ---------------------------------------------------------------------------
-- 5. sync_runs — journal d'exploitation, réservé aux administrateurs
-- ---------------------------------------------------------------------------
-- Avant : is_member(), donc tout le groupe historique (6 joueurs) pouvait
-- lire le détail des synchronisations (quota fournisseur consommé, erreurs).
-- Ce n'est utile qu'à l'administration (`/admin/synchronisation`) : on
-- resserre, on ne relâche jamais.

drop policy if exists sync_runs_read on sync_runs;
create policy sync_runs_read on sync_runs
  for select to authenticated
  using (
    public.is_admin() or exists (
      select 1 from league_members where user_id = (select auth.uid()) and role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- 6. events — flux d'événements, scopé comme sa saison
-- ---------------------------------------------------------------------------
-- Un événement sans season_id (aucun cas connu aujourd'hui — colonne
-- nullable dès 0002) reste visible des seuls administrateurs plutôt que de
-- personne : mieux vaut un repli restrictif qu'une ligne invisible qui
-- casserait silencieusement le fil ou les badges d'un admin qui doit
-- diagnostiquer un problème.

drop policy if exists events_read on events;
create policy events_read on events
  for select to authenticated
  using (
    case
      when season_id is not null then public.is_league_member(public.league_of_season(season_id))
      else public.is_admin() or exists (
        select 1 from league_members where user_id = (select auth.uid()) and role = 'admin'
      )
    end
  );
