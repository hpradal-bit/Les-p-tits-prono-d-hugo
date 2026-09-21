-- Messages vocaux dans Chambrage : un enregistrement du micro, comme sur
-- WhatsApp. Réutilise le bucket `chambrage-media` (0052) plutôt que d'en
-- ouvrir un second — mêmes règles d'accès, un fichier de plus à accepter.

alter table messages add column if not exists audio_duration_seconds int;

alter table messages drop constraint if exists messages_body_or_media;
alter table messages add constraint messages_body_or_media check (
  (message_type = 'text' and body is not null and length(trim(body)) > 0)
  or (message_type = 'image' and media_url is not null)
  or (message_type = 'poll' and body is not null and length(trim(body)) > 0)
  or (message_type = 'audio' and media_url is not null)
);

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Schéma « storage » absent : bucket ignoré (base de vérification locale).';
    return;
  end if;

  update storage.buckets
  set allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac'
  ]
  where id = 'chambrage-media';
end $$;
