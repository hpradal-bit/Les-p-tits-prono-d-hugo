-- ============================================================================
-- 0035 — Ligues privées (troisième incrément) : badges, séries, crédits, bonus
-- ----------------------------------------------------------------------------
-- Après 0033 (profils, pronostics) et 0034 (participation à la journée), les
-- cinq dernières tables de gamification/bonus lisaient encore `is_member()` —
-- « fait-il partie de l'unique groupe ? » — au lieu d'une ligue précise. Un
-- membre de la ligue A pouvait donc voir les badges, séries, jetons, usages
-- de pouvoirs et scores de bonus d'un membre de la ligue B.
--
-- Aucune nouvelle colonne : ces tables sont toutes rattachées à une saison
-- (directement, ou via round_id / question_id), et une saison ne porte
-- aujourd'hui qu'une seule ligue. `league_of_season`/`league_of_round`
-- retrouvent cette ligue par la même route que `resolveLeagueForSeason`
-- côté TypeScript (src/lib/leagues/queries.ts) — les deux devront être
-- revus ensemble le jour où une compétition héberge plusieurs ligues.
--
-- Le fil social (feed_posts/reactions/comments) N'EST PAS traité ici : son
-- modèle de données ne porte aujourd'hui aucune notion de ligue par message
-- (un mot publié dans le Vestiaire n'est rattaché à aucune saison), et le
-- cloisonner correctement demande d'abord une décision produit — un
-- sélecteur de ligue sur /vestiaire, ou un fil resté commun. Périmètre
-- documenté dans docs/05-ETAT.md, pas dans ce fichier.
-- ============================================================================

create or replace function public.league_of_season(sid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.id
  from seasons s
  join leagues l on l.competition_id = s.competition_id
  where s.id = sid
  order by l.created_at
  limit 1;
$$;

create or replace function public.league_of_round(rid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.league_of_season(r.season_id)
  from rounds r
  where r.id = rid;
$$;

comment on function public.league_of_season(uuid) is
  'La ligue d''une saison — la première par ancienneté si plusieurs devaient un
   jour partager une compétition. À refaire proprement (colonne league_id) le
   jour où c''est le cas ; vrai à 100% aujourd''hui (une ligue par compétition).';

revoke all on function public.league_of_season(uuid) from public;
revoke all on function public.league_of_round(uuid) from public;
grant execute on function public.league_of_season(uuid) to authenticated;
grant execute on function public.league_of_round(uuid) to authenticated;

drop policy if exists user_badges_read on user_badges;
create policy user_badges_read on user_badges
  for select to authenticated
  using (public.is_league_member(public.league_of_season(season_id)));

drop policy if exists streaks_read on streaks;
create policy streaks_read on streaks
  for select to authenticated
  using (public.is_league_member(public.league_of_season(season_id)));

drop policy if exists tokens_read on tokens;
create policy tokens_read on tokens
  for select to authenticated
  using (public.is_league_member(public.league_of_season(season_id)));

drop policy if exists power_usages_read on power_usages;
create policy power_usages_read on power_usages
  for select to authenticated
  using (public.is_league_member(public.league_of_round(round_id)));

drop policy if exists bonus_scores_read on bonus_scores;
create policy bonus_scores_read on bonus_scores
  for select to authenticated
  using (
    exists (
      select 1 from bonus_questions q
      where q.id = bonus_scores.question_id
        and public.is_league_member(public.league_of_season(q.season_id))
    )
  );
