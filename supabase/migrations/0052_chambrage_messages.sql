-- Chambrage devient une vraie messagerie de groupe, par ligue.
--
-- L'ancien Chambrage mélangeait deux natures différentes dans `feed_posts` :
-- le narrateur automatique du jeu (score exact, journée close — `event_id`
-- posé, règle n° 8 : le fil ne fait que lire les `events`) et le mot écrit à
-- la main par un joueur (`event_id` nul, publié depuis `publishPost`). Cette
-- migration sépare les deux : `feed_posts`/`events` restent le narrateur du
-- jeu, inchangés ; une vraie conversation (`messages`) prend la suite pour ce
-- que les joueurs s'écrivent — réponses, réactions (une par personne, pas une
-- pile), photos, statut lu, temps réel.
--
-- Portée par ligue comme le reste (`league_id`), jamais par groupe global.

create type message_type as enum ('text', 'image');

create table messages (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  -- `set null` plutôt que cascade : un compte supprimé ne doit pas effacer sa
  -- part de l'historique de la conversation, seulement son identité dessus.
  sender_id uuid references profiles(id) on delete set null,
  message_type message_type not null default 'text',
  body text,
  media_url text,
  reply_to_id uuid references messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Suppression douce : un message supprimé garde sa ligne (une réponse qui
  -- le cite ne doit pas pointer dans le vide) mais l'écran affiche
  -- « Message supprimé » à sa place.
  deleted_at timestamptz,
  constraint messages_body_or_media check (
    (message_type = 'text' and body is not null and length(trim(body)) > 0)
    or (message_type = 'image' and media_url is not null)
  )
);

-- Le fil se lit du plus récent au plus ancien, par ligue : c'est la seule
-- requête réelle de la messagerie (pagination par curseur sur `created_at`).
create index messages_league_created_idx on messages (league_id, created_at desc);
create index messages_reply_to_idx on messages (reply_to_id) where reply_to_id is not null;

alter table messages replica identity full;

create table message_reactions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  -- Une seule réaction active par personne et par message (§2.8) : changer
  -- d'avis remplace la ligne, ça n'en empile pas une deuxième.
  primary key (message_id, user_id)
);

alter table message_reactions replica identity full;

-- Qui a lu jusqu'où, par ligue. Personnel : chacun sa ligne, mais lisible par
-- tout le monde dans la ligue pour calculer « lu par Untel » sous un message
-- (une conversation de groupe n'a pas de secret de lecture entre membres).
create table message_reads (
  league_id uuid not null references leagues(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

alter table messages enable row level security;
alter table message_reactions enable row level security;
alter table message_reads enable row level security;

create policy messages_read on messages
  for select to authenticated
  using (public.is_league_member(league_id));

create policy messages_insert on messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_league_member(league_id));

-- Une seule policy update : elle couvre à la fois « modifier le texte » et
-- « supprimer » (poser deleted_at), les deux n'étant que l'auteur qui change
-- sa propre ligne.
create policy messages_update_own on messages
  for update to authenticated
  using (sender_id = auth.uid() and public.is_league_member(league_id))
  with check (sender_id = auth.uid() and public.is_league_member(league_id));

create policy message_reactions_read on message_reactions
  for select to authenticated
  using (
    exists (
      select 1 from messages m
      where m.id = message_reactions.message_id and public.is_league_member(m.league_id)
    )
  );

create policy message_reactions_write on message_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from messages m
      where m.id = message_reactions.message_id and public.is_league_member(m.league_id)
    )
  );

create policy message_reactions_update_own on message_reactions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy message_reactions_delete_own on message_reactions
  for delete to authenticated
  using (user_id = auth.uid());

create policy message_reads_read on message_reads
  for select to authenticated
  using (public.is_league_member(league_id));

create policy message_reads_write_own on message_reads
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_league_member(league_id));

create policy message_reads_update_own on message_reads
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Temps réel : Postgres Changes sur les messages et les réactions. Les
-- politiques `_read` ci-dessus gouvernent déjà qui reçoit quoi — un abonnement
-- ne peut jamais montrer une ligne que son auteur ne pourrait pas lire
-- lui-même. Gardé conditionnel : la publication `supabase_realtime` n'existe
-- pas sur la base de vérification locale (simple PostgreSQL, pas la pile
-- Supabase complète).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table messages';
    execute 'alter publication supabase_realtime add table message_reactions';
  else
    raise notice 'Publication supabase_realtime absente : temps réel ignoré (base de vérification locale).';
  end if;
end $$;

-- Stockage des photos envoyées dans Chambrage. Bucket public comme celui des
-- avatars (même idiome) : ce sont des photos de groupe entre amis, pas des
-- documents sensibles — pas besoin d'URLs signées pour ce cas d'usage.
-- Gardé conditionnel : `scripts/verify-migrations.sh` rejoue les migrations
-- sur une base sans le schéma `storage`.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Schéma « storage » absent : bloc Storage ignoré (base de vérification locale).';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'chambrage-media', 'chambrage-media', true, 8388608,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  )
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists chambrage_media_read on storage.objects';
  execute $p$create policy chambrage_media_read on storage.objects
    for select to public
    using (bucket_id = 'chambrage-media')$p$;

  -- Le chemin porte l'identifiant de ligue en premier segment
  -- (`<league_id>/<uuid>.<ext>`) : seul un membre de CETTE ligue peut y
  -- déposer une photo.
  execute 'drop policy if exists chambrage_media_insert on storage.objects';
  execute $p$create policy chambrage_media_insert on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'chambrage-media'
      and public.is_league_member(((storage.foldername(name))[1])::uuid)
    )$p$;
end $$;

-- Catalogue des notifications : trois nouveaux types, chacun avec son
-- interrupteur dans les réglages du joueur, comme le reste (règle n° 1 :
-- rien en dur, tout modifiable depuis l'admin). La condition rend la
-- migration rejouable sans doublon.
update app_settings
set value = value || '[
      {"kind":"chat_message","emoji":"💬","label":"Nouveau message dans Chambrage",
       "description":"Quand quelqu''un écrit dans Chambrage.",
       "default_enabled":true,"wired":true},
      {"kind":"chat_reply","emoji":"↩️","label":"Réponse à ton message",
       "description":"Quand quelqu''un répond directement à l''un de tes messages.",
       "default_enabled":true,"wired":true},
      {"kind":"chat_reaction","emoji":"❤️","label":"Réaction à ton message",
       "description":"Quand quelqu''un réagit à l''un de tes messages.",
       "default_enabled":true,"wired":true}
    ]'::jsonb,
    updated_at = now()
where key = 'notifications.types'
  and not (value @> '[{"kind":"chat_message"}]'::jsonb);
