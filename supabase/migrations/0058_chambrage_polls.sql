-- Sondages dans Chambrage, comme sur WhatsApp : une question (portée par
-- `messages.body`, un message est un message), 2 à 10 réponses possibles,
-- une case à cocher « réponses multiples » optionnelle. Transparent comme le
-- reste de Chambrage : qui a voté quoi se voit, il n'y a pas de sondage
-- anonyme dans un groupe de six amis.

alter table messages add column if not exists poll_allows_multiple boolean;

-- Un message texte ou image garde ses règles ; un sondage porte sa question
-- dans `body`, comme un message texte.
alter table messages drop constraint if exists messages_body_or_media;
alter table messages add constraint messages_body_or_media check (
  (message_type = 'text' and body is not null and length(trim(body)) > 0)
  or (message_type = 'image' and media_url is not null)
  or (message_type = 'poll' and body is not null and length(trim(body)) > 0)
);

create table if not exists poll_options (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  position int not null,
  label text not null check (length(trim(label)) > 0),
  unique (message_id, position)
);

create table if not exists poll_votes (
  option_id uuid not null references poll_options(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);

alter table poll_options replica identity full;
alter table poll_votes replica identity full;

alter table poll_options enable row level security;
alter table poll_votes enable row level security;

create policy poll_options_read on poll_options
  for select to authenticated
  using (
    exists (
      select 1 from messages m
      where m.id = poll_options.message_id and public.is_league_member(m.league_id)
    )
  );

-- Les options sont posées par le serveur, dans la même transaction logique
-- que le message : seul l'auteur du message peut les créer, jamais après
-- coup (pas de policy update/delete — un sondage publié ne se retouche pas).
create policy poll_options_insert on poll_options
  for insert to authenticated
  with check (
    exists (
      select 1 from messages m
      where m.id = poll_options.message_id and m.sender_id = auth.uid()
    )
  );

create policy poll_votes_read on poll_votes
  for select to authenticated
  using (
    exists (
      select 1 from poll_options o
      join messages m on m.id = o.message_id
      where o.id = poll_votes.option_id and public.is_league_member(m.league_id)
    )
  );

create policy poll_votes_write on poll_votes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from poll_options o
      join messages m on m.id = o.message_id
      where o.id = poll_votes.option_id and public.is_league_member(m.league_id)
    )
  );

create policy poll_votes_delete_own on poll_votes
  for delete to authenticated
  using (user_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'poll_votes'
    ) then
      execute 'alter publication supabase_realtime add table poll_votes';
    end if;
  else
    raise notice 'Publication supabase_realtime absente : temps réel ignoré (base de vérification locale).';
  end if;
end $$;
