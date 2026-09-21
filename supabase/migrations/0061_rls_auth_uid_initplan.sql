-- Corrige la ré-évaluation ligne par ligne de auth.uid() dans les policies RLS
-- (avertissement Supabase « auth_rls_initplan »). `auth.uid()` nu est traité
-- comme une expression à réévaluer pour chaque ligne balayée ; `(select
-- auth.uid())` permet à Postgres de le résoudre une seule fois par requête
-- (InitPlan), au lieu d'une fois par ligne. Comportement strictement
-- identique — seule la vitesse change. Touche la quasi-totalité des lectures
-- authentifiées de l'application (pronostics, messages, fil, notifications).

alter policy bonus_answers_read on public.bonus_answers
  using (
    (user_id = (select auth.uid()))
    or (exists (
      select 1 from bonus_questions q
      where q.id = bonus_answers.question_id
        and (q.closes_at is null or q.closes_at <= now() or q.status = any (array['closed'::question_status, 'settled'::question_status]))
    ))
  );

alter policy bonus_answers_update on public.bonus_answers
  using (
    (user_id = (select auth.uid()))
    and (exists (
      select 1 from bonus_questions q
      where q.id = bonus_answers.question_id
        and q.status = 'open'::question_status
        and (q.closes_at is null or q.closes_at > now())
    ))
  )
  with check (user_id = (select auth.uid()));

alter policy bonus_answers_write on public.bonus_answers
  with check (
    (user_id = (select auth.uid()))
    and (exists (
      select 1 from bonus_questions q
      where q.id = bonus_answers.question_id
        and q.status = 'open'::question_status
        and (q.opens_at is null or q.opens_at <= now())
        and (q.closes_at is null or q.closes_at > now())
    ))
  );

alter policy celebration_views_own on public.celebration_views
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy comments_update_own on public.comments
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy comments_write on public.comments
  with check (
    (user_id = (select auth.uid()))
    and (exists (
      select 1 from feed_posts p
      where p.id = comments.post_id and is_league_member(p.league_id)
    ))
  );

alter policy feed_posts_insert on public.feed_posts
  with check (
    (author_id = (select auth.uid()))
    and (event_id is null)
    and is_league_member(league_id)
  );

alter policy feed_posts_update_own on public.feed_posts
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

alter policy feed_reads_read on public.feed_reads
  using (user_id = (select auth.uid()));

alter policy feed_reads_update on public.feed_reads
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy feed_reads_write on public.feed_reads
  with check (
    (user_id = (select auth.uid()))
    and is_league_member(league_id)
  );

alter policy message_reactions_delete_own on public.message_reactions
  using (user_id = (select auth.uid()));

alter policy message_reactions_update_own on public.message_reactions
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy message_reactions_write on public.message_reactions
  with check (
    (user_id = (select auth.uid()))
    and (exists (
      select 1 from messages m
      where m.id = message_reactions.message_id and is_league_member(m.league_id)
    ))
  );

alter policy message_reads_update_own on public.message_reads
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy message_reads_write_own on public.message_reads
  with check (
    (user_id = (select auth.uid()))
    and is_league_member(league_id)
  );

alter policy messages_insert on public.messages
  with check (
    (sender_id = (select auth.uid()))
    and is_league_member(league_id)
  );

alter policy messages_update_own on public.messages
  using (
    (sender_id = (select auth.uid()))
    and is_league_member(league_id)
  )
  with check (
    (sender_id = (select auth.uid()))
    and is_league_member(league_id)
  );

alter policy notif_prefs_own on public.notification_preferences
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy notif_settings_own on public.notification_settings
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy notifications_read_own on public.notifications
  using (user_id = (select auth.uid()));

alter policy notifications_update_own on public.notifications
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy poll_options_insert on public.poll_options
  with check (
    exists (
      select 1 from messages m
      where m.id = poll_options.message_id and m.sender_id = (select auth.uid())
    )
  );

alter policy poll_votes_delete_own on public.poll_votes
  using (user_id = (select auth.uid()));

alter policy poll_votes_write on public.poll_votes
  with check (
    (user_id = (select auth.uid()))
    and (exists (
      select 1 from poll_options o join messages m on m.id = o.message_id
      where o.id = poll_votes.option_id and is_league_member(m.league_id)
    ))
  );

alter policy predictions_insert_self on public.predictions
  with check (
    (user_id = (select auth.uid()))
    and (not fixture_is_locked(fixture_id))
    and (is_auto = false)
  );

alter policy predictions_read on public.predictions
  using (
    (user_id = (select auth.uid()))
    or (fixture_is_locked(fixture_id) and shares_league_for_fixture(user_id, fixture_id))
  );

alter policy predictions_update_self on public.predictions
  using (
    (user_id = (select auth.uid()))
    and (not fixture_is_locked(fixture_id))
  )
  with check (
    (user_id = (select auth.uid()))
    and (not fixture_is_locked(fixture_id))
  );

alter policy profiles_read on public.profiles
  using (
    (id = (select auth.uid()))
    or shares_any_league(id)
  );

alter policy profiles_update_self on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy push_subs_own on public.push_subscriptions
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy reactions_delete on public.reactions
  using (user_id = (select auth.uid()));

alter policy reactions_write on public.reactions
  with check (
    (user_id = (select auth.uid()))
    and (exists (
      select 1 from feed_posts p
      where p.id = reactions.post_id and is_league_member(p.league_id)
    ))
  );
