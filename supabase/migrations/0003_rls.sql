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
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_member())',
      t || '_read', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Profils & groupes
-- ---------------------------------------------------------------------------

drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles
  for select to authenticated using (public.is_member());

-- Un joueur modifie son profil, jamais son rôle (le rôle vit dans group_members).
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists groups_read on groups;
create policy groups_read on groups
  for select to authenticated using (public.is_member());

drop policy if exists group_members_read on group_members;
create policy group_members_read on group_members
  for select to authenticated using (public.is_member());

-- ---------------------------------------------------------------------------
-- PRONOSTICS — le cœur de la confidentialité
-- ---------------------------------------------------------------------------

-- Je vois toujours les miens ; ceux des autres uniquement après verrouillage.
drop policy if exists predictions_read on predictions;
create policy predictions_read on predictions
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.fixture_is_locked(fixture_id)
  );

-- Je ne peux créer un pronostic que pour moi, et seulement avant le verrouillage.
drop policy if exists predictions_insert_self on predictions;
create policy predictions_insert_self on predictions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.fixture_is_locked(fixture_id)
    and is_auto = false
  );

-- Je ne peux modifier que le mien, et seulement avant le verrouillage.
drop policy if exists predictions_update_self on predictions;
create policy predictions_update_self on predictions
  for update to authenticated
  using (user_id = auth.uid() and not public.fixture_is_locked(fixture_id))
  with check (user_id = auth.uid() and not public.fixture_is_locked(fixture_id));

-- Aucune politique DELETE : un pronostic ne se supprime pas côté client.

-- Les points sont visibles de tous, mais écrits uniquement par le serveur.
drop policy if exists prediction_scores_read on prediction_scores;
create policy prediction_scores_read on prediction_scores
  for select to authenticated using (public.is_member());

drop policy if exists prediction_audit_read on prediction_audit;
create policy prediction_audit_read on prediction_audit
  for select to authenticated using (public.is_member());

-- ---------------------------------------------------------------------------
-- Ajustements de points & journal d'administration : lecture publique
-- ---------------------------------------------------------------------------
-- Aucune politique d'écriture, y compris pour l'admin : seul le serveur écrit,
-- et le journal ne peut être ni modifié ni effacé.

drop policy if exists point_adjustments_read on point_adjustments;
create policy point_adjustments_read on point_adjustments
  for select to authenticated using (public.is_member());

drop policy if exists admin_actions_read on admin_actions;
create policy admin_actions_read on admin_actions
  for select to authenticated using (public.is_member());

-- ---------------------------------------------------------------------------
-- Questions bonus — même règle de secret que les pronostics
-- ---------------------------------------------------------------------------

drop policy if exists bonus_questions_read on bonus_questions;
create policy bonus_questions_read on bonus_questions
  for select to authenticated
  using (public.is_member() and (status <> 'draft' or public.is_admin()));

drop policy if exists bonus_answers_read on bonus_answers;
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

drop policy if exists bonus_answers_write on bonus_answers;
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

drop policy if exists bonus_answers_update on bonus_answers;
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

drop policy if exists bonus_results_read on bonus_results;
create policy bonus_results_read on bonus_results
  for select to authenticated using (public.is_member());

drop policy if exists bonus_scores_read on bonus_scores;
create policy bonus_scores_read on bonus_scores
  for select to authenticated using (public.is_member());

-- ---------------------------------------------------------------------------
-- Gamification : lecture pour tous, attribution par le serveur
-- ---------------------------------------------------------------------------

drop policy if exists user_badges_read on user_badges;
create policy user_badges_read on user_badges
  for select to authenticated using (public.is_member());

drop policy if exists streaks_read on streaks;
create policy streaks_read on streaks
  for select to authenticated using (public.is_member());

drop policy if exists tokens_read on tokens;
create policy tokens_read on tokens
  for select to authenticated using (public.is_member());

drop policy if exists power_usages_read on power_usages;
create policy power_usages_read on power_usages
  for select to authenticated using (public.is_member());

-- Déclarer un pouvoir passe par le serveur (vérification du token, de la cible,
-- de la fenêtre de déclaration) : aucune politique d'écriture côté client.

-- ---------------------------------------------------------------------------
-- Social
-- ---------------------------------------------------------------------------

drop policy if exists events_read on events;
create policy events_read on events
  for select to authenticated using (public.is_member());

drop policy if exists feed_posts_read on feed_posts;
create policy feed_posts_read on feed_posts
  for select to authenticated
  using (public.is_member() and (not is_hidden or public.is_admin()));

drop policy if exists feed_posts_insert on feed_posts;
create policy feed_posts_insert on feed_posts
  for insert to authenticated
  with check (author_id = auth.uid() and event_id is null);

drop policy if exists feed_posts_update_own on feed_posts;
create policy feed_posts_update_own on feed_posts
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists reactions_read on reactions;
create policy reactions_read on reactions
  for select to authenticated using (public.is_member());

drop policy if exists reactions_write on reactions;
create policy reactions_write on reactions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists reactions_delete on reactions;
create policy reactions_delete on reactions
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists comments_read on comments;
create policy comments_read on comments
  for select to authenticated
  using (public.is_member() and (not is_hidden or public.is_admin()));

drop policy if exists comments_write on comments;
create policy comments_write on comments
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists comments_update_own on comments;
create policy comments_update_own on comments
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Notifications : strictement personnelles
-- ---------------------------------------------------------------------------

drop policy if exists notifications_read_own on notifications;
create policy notifications_read_own on notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notifications_update_own on notifications;
create policy notifications_update_own on notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_subs_own on push_subscriptions;
create policy push_subs_own on push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notif_prefs_own on notification_preferences;
create policy notif_prefs_own on notification_preferences
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
