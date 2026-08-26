-- ============================================================================
-- 0036 — Ligues privées (cinquième incrément) : le Vestiaire, par ligue
-- ----------------------------------------------------------------------------
-- Décision produit (Hugo, 26 août) : un Vestiaire par ligue plutôt qu'un fil
-- commun à toutes les ligues d'un joueur. Contrairement aux tables des
-- incréments précédents, `feed_posts` ne se rattache à aucune saison — un mot
-- publié par un joueur n'a par nature aucun lien avec une compétition. Il n'y
-- a donc pas de dérivation possible : la colonne `group_id`, déjà présente
-- mais jamais exploitée par les RLS (`feed_posts_read` lisait `is_member()`,
-- pas `group_id`), est repointée vers `league_id`.
--
-- Les messages déjà publiés n'ont aucune trace de compétition : impossible de
-- les rattacher automatiquement à une ligue précise. Ils basculent tous vers
-- la ligue historique « Prono des copains » (clé COPAINS), là où ils ont
-- réellement été écrits — un seul groupe existait jusqu'ici.
-- ============================================================================

alter table feed_posts add column if not exists league_id uuid references leagues(id) on delete cascade;

update feed_posts fp
set league_id = l.id
from leagues l
where fp.league_id is null and l.join_key = 'COPAINS';

-- Filet de sécurité si la ligue COPAINS n'existe pas (ex. base de
-- vérification locale démarrée sans données de démo) : à défaut, la plus
-- ancienne ligue disponible.
update feed_posts
set league_id = (select id from leagues order by created_at limit 1)
where league_id is null;

alter table feed_posts alter column league_id set not null;
alter table feed_posts drop column group_id;

drop index if exists feed_posts_event_unique;
create unique index if not exists feed_posts_event_unique
  on feed_posts (league_id, event_id)
  where event_id is not null;

drop index if exists idx_feed_posts_group_id_created_at_desc;
create index if not exists idx_feed_posts_league_id_created_at_desc on feed_posts (league_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS — lecture cloisonnée par ligue, écriture désormais vérifiée (elle ne
-- l'était pas : feed_posts_insert/reactions_write/comments_write ne
-- vérifiaient que l'auteur, jamais son appartenance au fil visé).
-- ---------------------------------------------------------------------------

drop policy if exists feed_posts_read on feed_posts;
create policy feed_posts_read on feed_posts
  for select to authenticated
  using (public.is_league_member(league_id) and (not is_hidden or public.is_admin()));

drop policy if exists feed_posts_insert on feed_posts;
create policy feed_posts_insert on feed_posts
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and event_id is null
    and public.is_league_member(league_id)
  );

drop policy if exists reactions_read on reactions;
create policy reactions_read on reactions
  for select to authenticated
  using (
    exists (
      select 1 from feed_posts p
      where p.id = reactions.post_id and public.is_league_member(p.league_id)
    )
  );

drop policy if exists reactions_write on reactions;
create policy reactions_write on reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from feed_posts p
      where p.id = reactions.post_id and public.is_league_member(p.league_id)
    )
  );

drop policy if exists comments_read on comments;
create policy comments_read on comments
  for select to authenticated
  using (
    exists (
      select 1 from feed_posts p
      where p.id = comments.post_id and public.is_league_member(p.league_id)
    )
    and (not is_hidden or public.is_admin())
  );

drop policy if exists comments_write on comments;
create policy comments_write on comments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from feed_posts p
      where p.id = comments.post_id and public.is_league_member(p.league_id)
    )
  );

-- feed_posts_update_own, reactions_delete, comments_update_own ne changent
-- pas : elles ne touchent qu'à une ligne déjà possédée par son auteur, sans
-- notion d'appartenance à vérifier.
