-- Les messages non lus.
--
-- Une ligne par joueur et par ligue : la date du dernier passage dans le
-- Vestiaire. Un message publié après cette date est « non lu » pour ce
-- joueur-là, et pour lui seul — c'est tout l'intérêt : la pastille disparaît
-- quand *moi* j'ai lu, pas quand quelqu'un d'autre a lu.
--
-- Pas de table « lu / pas lu » message par message : à six joueurs et quelques
-- centaines de messages, une date de dernière lecture dit exactement la même
-- chose pour une fraction du coût, et ne grossit jamais.

create table if not exists feed_reads (
  user_id    uuid not null references profiles(id) on delete cascade,
  league_id  uuid not null references leagues(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, league_id)
);

comment on table feed_reads is
  'Dernier passage de chaque joueur dans le Vestiaire d''une ligue. Sert à '
  'décider si la pastille « non lu » doit s''allumer. Strictement personnel : '
  'RLS interdit de lire ou d''écrire la ligne d''un autre.';

alter table feed_reads enable row level security;

-- Sa propre ligne, et rien d'autre. Ni lecture ni écriture sur celle d'autrui :
-- savoir quand un adversaire a ouvert le fil ne regarde personne.
drop policy if exists feed_reads_read on feed_reads;
create policy feed_reads_read on feed_reads
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists feed_reads_write on feed_reads;
create policy feed_reads_write on feed_reads
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_league_member(league_id));

drop policy if exists feed_reads_update on feed_reads;
create policy feed_reads_update on feed_reads
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- La question posée à chaque chargement est « y a-t-il du neuf depuis telle
-- date, dans cette ligue, qui ne vienne pas de moi ? ».
create index if not exists feed_posts_league_created_idx
  on feed_posts (league_id, created_at desc)
  where is_hidden = false;
