-- ============================================================================
-- LES P'TITS PRONOS D'HUGO — Verrouillage des fonctions exposées
-- ----------------------------------------------------------------------------
-- L'analyse de sécurité Supabase a relevé que plusieurs fonctions internes
-- restaient appelables depuis l'API REST. La migration 0011 les révoquait bien
-- « from public », mais Supabase accorde EXECUTE explicitement aux rôles `anon`
-- et `authenticated` : la révocation ne les touchait pas.
--
-- Le cas qui compte vraiment : `exact_score_state(p_user_id, p_fixture_id)`
-- prend un identifiant de joueur en paramètre. Un membre connecté pouvait donc
-- demander l'état du quota de score exact d'un adversaire — une information de
-- jeu, au même titre qu'un pronostic.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Couper à la racine : PostgreSQL accorde EXECUTE à PUBLIC par défaut
-- ---------------------------------------------------------------------------
-- Révoquer nommément sur `anon` ne suffisait pas : le rôle héritait du droit
-- accordé à PUBLIC. C'est la raison pour laquelle la révocation de la 0011
-- n'avait aucun effet visible.

revoke execute on function public.is_admin()                    from public, anon;
revoke execute on function public.is_member()                   from public, anon;
revoke execute on function public.fixture_is_locked(uuid)       from public, anon;
revoke execute on function public.setting_bool(text, boolean)   from public, anon;
revoke execute on function public.round_participation(uuid)     from public, anon;
revoke execute on function public.game_timezone()               from public, anon, authenticated;
revoke execute on function public.exact_score_state(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rules_for_fixture(uuid)       from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Rendre le strict nécessaire aux joueurs connectés
-- ---------------------------------------------------------------------------
-- Les quatre premières sont appelées par les politiques RLS elles-mêmes : sans
-- ce droit, plus personne ne lit quoi que ce soit. La cinquième ne renvoie que
-- des nombres — combien de pronostics manquent, jamais lesquels.

grant execute on function public.is_admin()                  to authenticated;
grant execute on function public.is_member()                 to authenticated;
grant execute on function public.fixture_is_locked(uuid)     to authenticated;
grant execute on function public.setting_bool(text, boolean) to authenticated;
grant execute on function public.round_participation(uuid)   to authenticated;

grant execute on function public.game_timezone()               to service_role;
grant execute on function public.exact_score_state(uuid, uuid) to service_role;
grant execute on function public.rules_for_fixture(uuid)       to service_role;

-- ---------------------------------------------------------------------------
-- 3. Les fonctions de déclencheur ne s'appellent pas à la main
-- ---------------------------------------------------------------------------
-- Un déclencheur s'exécute au nom du propriétaire de la table : personne n'a
-- besoin du droit d'exécution pour que le garde-fou fonctionne.

create or replace function public.forbid_rewrite()
returns trigger language plpgsql set search_path = public
as $$
begin
  raise exception
    'La table %.% est en écriture seule : % interdit. Corriger en ajoutant une nouvelle ligne.',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

create or replace function public.profiles_touch_updated_at()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.predictions_guard()',
    'public.predictions_write_audit()',
    'public.forbid_rewrite()',
    'public.profiles_touch_updated_at()'
  ]
  loop
    if to_regprocedure(fn) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', fn);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Ce qui reste accessible aux joueurs connectés, et pourquoi
-- ---------------------------------------------------------------------------
-- · is_member / is_admin / fixture_is_locked / setting_bool : appelées par les
--   politiques RLS elles-mêmes, le rôle appelant doit pouvoir les exécuter ;
-- · round_participation : ne renvoie que des nombres (« Marco n'a pas joué 2
--   matchs »), jamais le contenu d'un pronostic.

comment on table external_refs is
  'Correspondance entre nos identifiants et ceux des fournisseurs de données.
   RLS active et volontairement SANS politique : seul le serveur y accède.
   L''analyse Supabase la signale, c''est l''état recherché.';
