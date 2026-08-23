-- ============================================================================
-- LES P'TITS PRONOS D'HUGO — Chantier A · Comptes & profils
-- ----------------------------------------------------------------------------
-- 1. Réglages d'avatar (taille, types, palette d'emojis) : en base, jamais en dur.
-- 2. Groupe d'amorçage, sans lequel personne ne peut s'inscrire.
-- 3. Bucket Storage « avatars » et ses politiques.
-- 4. Déclencheur de fraîcheur sur profiles.updated_at.
--
-- Le bloc Storage est encadré par un garde-fou : le schéma « storage » est
-- fourni par Supabase et n'existe pas sur la base jetable de
-- scripts/verify-migrations.sh. La migration doit s'appliquer dans les deux cas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Réglages d'avatar
-- ---------------------------------------------------------------------------
-- Source de vérité unique : le serveur relit ces valeurs à chaque téléversement,
-- et le bucket Storage ci-dessous en dérive ses propres limites.

insert into app_settings (key, value) values
  ('avatar.max_bytes',      '2097152'::jsonb),                                   -- 2 Mo
  ('avatar.allowed_mime',   '["image/png","image/jpeg","image/webp"]'::jsonb),
  ('avatar.default_kind',   '"emoji"'::jsonb),
  ('avatar.default_value',  '"🏉"'::jsonb),
  ('avatar.emoji_choices',
   '["🏉","🥇","🔥","🐐","🦁","🐻","🦅","🐗","🦈","🐉","🤠","🧠","🍺","🥐","🧀","🎯","🚀","👑","😎","🤡","💀","🫡","🙈","🧊"]'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Groupe d'amorçage
-- ---------------------------------------------------------------------------
-- L'inscription vérifie le code saisi contre groups.invite_code. Sans groupe,
-- aucune inscription n'est possible : on en crée donc un, rattaché à la saison
-- active du Top 14.
--
-- ⚠️ CODE PROVISOIRE, PUBLIC (il est dans le dépôt Git). À changer depuis
--    l'espace admin avant d'envoyer les invitations, ou à la main :
--      update groups set invite_code = 'LE-VRAI-CODE' where invite_code = 'TOP14-2026';
--
-- ⚠️ AUCUN ADMIN N'EXISTE tant qu'un compte n'a pas été promu. Après la
--    première inscription :
--      update group_members set role = 'admin' where user_id = (
--        select id from profiles where display_name = 'Hugo');

-- Le garde-fou porte sur « un groupe existe-t-il déjà ? », et non sur le code
-- lui-même : Hugo change son code d'invitation depuis l'admin, et une relance
-- du script ne doit pas en profiter pour recréer un second groupe.
insert into groups (name, invite_code, active_season_id)
select 'Les p''tits pronos d''Hugo', 'TOP14-2026', se.id
from seasons se
join competitions c on c.id = se.competition_id
where c.code = 'top14'
  and se.label = '2026/2027'
  and not exists (select 1 from groups);

-- ---------------------------------------------------------------------------
-- 3. Fraîcheur de profiles.updated_at
-- ---------------------------------------------------------------------------
-- La colonne existe depuis 0001 mais rien ne la mettait à jour : l'écran de
-- profil s'appuie dessus, et le fil social saura dire « untel a changé d'avatar ».

create or replace function public.profiles_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.profiles_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Bucket Storage « avatars »
-- ---------------------------------------------------------------------------
-- Choix assumé : bucket en lecture publique.
--   · Une photo d'avatar entre 6 amis n'est pas une donnée sensible ; le secret
--     que la base doit protéger, ce sont les pronostics (cf. 0003_rls.sql).
--   · Les avatars s'affichent partout (classement, fil, match center). Un bucket
--     privé imposerait une URL signée à chaque écran, donc à chaque chantier.
-- L'écriture, elle, est verrouillée : chacun n'écrit que dans son propre dossier,
-- nommé d'après son identifiant utilisateur.

do $$
declare
  v_max_bytes bigint;
  v_mime      text[];
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Schéma « storage » absent : bloc Storage ignoré (base de vérification locale).';
    return;
  end if;

  select (value #>> '{}')::bigint into v_max_bytes
    from app_settings where key = 'avatar.max_bytes';

  select array(select jsonb_array_elements_text(value)) into v_mime
    from app_settings where key = 'avatar.allowed_mime';

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, v_max_bytes, v_mime)
  on conflict (id) do update set
    public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  -- Politiques : on repart de zéro pour que la migration soit rejouable.
  execute 'drop policy if exists avatars_read       on storage.objects';
  execute 'drop policy if exists avatars_insert_own on storage.objects';
  execute 'drop policy if exists avatars_update_own on storage.objects';
  execute 'drop policy if exists avatars_delete_own on storage.objects';

  -- Lecture : le bucket est public, la politique le dit explicitement.
  execute $p$
    create policy avatars_read on storage.objects
      for select to public
      using (bucket_id = 'avatars')
  $p$;

  -- Écriture : uniquement dans « <mon-uuid>/… », et seulement connecté.
  execute $p$
    create policy avatars_insert_own on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $p$;

  execute $p$
    create policy avatars_update_own on storage.objects
      for update to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $p$;

  -- Suppression : nécessaire pour effacer l'ancienne photo au remplacement.
  execute $p$
    create policy avatars_delete_own on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $p$;
end $$;
