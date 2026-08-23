-- ============================================================================
-- LES P'TITS PRONOS D'HUGO — Espace d'administration
-- ----------------------------------------------------------------------------
-- Cette migration ne crée aucune table : le schéma de la vague 0 suffit.
-- Elle rend le journal d'administration réellement infalsifiable et le rend
-- lisible par les joueurs, parce que c'est là-dessus que repose la confiance
-- du groupe (cf. docs/00-AUDIT.md, point 18).
--
--   1. `admin_actions` et `point_adjustments` deviennent append-only, y compris
--      pour la clé de service. Aucune ligne ne peut être réécrite ni effacée.
--   2. Une raison est obligatoire au niveau de la base, pas seulement du code.
--   3. Le journal est lisible par tous les joueurs quand le réglage
--      `admin_log.public` est vrai — l'admin, lui, le voit toujours.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Lecture d'un réglage booléen depuis les politiques RLS
-- ---------------------------------------------------------------------------
-- app_settings est soumis à RLS : une politique ne peut pas l'interroger
-- directement. On passe par une fonction `security definer`.

create or replace function public.setting_bool(k text, fallback boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(value #>> '{}', '')::boolean from app_settings where key = k),
    fallback
  );
$$;

comment on function public.setting_bool(text, boolean) is
  'Lit un réglage booléen de app_settings depuis une politique RLS. Renvoie la valeur de repli si la clé est absente.';

-- ---------------------------------------------------------------------------
-- 2. Immuabilité : le journal et les ajustements ne se réécrivent pas
-- ---------------------------------------------------------------------------
-- L'absence de politique UPDATE/DELETE protège les joueurs, mais pas la clé de
-- service, qui contourne RLS. Un déclencheur, lui, s'applique à tout le monde.
-- Corriger un ajustement se fait en écrivant l'ajustement inverse : la
-- reconstruction du classement à partir des données brutes reste possible.

create or replace function public.forbid_rewrite()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'La table %.% est en écriture seule : % interdit. Corriger en ajoutant une nouvelle ligne.',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger admin_actions_no_update
  before update on admin_actions
  for each row execute function public.forbid_rewrite();

create trigger admin_actions_no_delete
  before delete on admin_actions
  for each row execute function public.forbid_rewrite();

create trigger point_adjustments_no_update
  before update on point_adjustments
  for each row execute function public.forbid_rewrite();

create trigger point_adjustments_no_delete
  before delete on point_adjustments
  for each row execute function public.forbid_rewrite();

-- ---------------------------------------------------------------------------
-- 3. Une raison, toujours
-- ---------------------------------------------------------------------------
-- « Toute action d'administration écrit dans admin_actions, avec une raison. »
-- La règle est dans CLAUDE.md ; on la fait respecter par la base.

alter table admin_actions
  add constraint admin_actions_reason_required
  check (reason is not null and length(btrim(reason)) >= 3);

alter table admin_actions
  add constraint admin_actions_action_not_blank
  check (length(btrim(action)) > 0);

alter table point_adjustments
  add constraint point_adjustments_reason_required
  check (length(btrim(reason)) >= 3);

alter table point_adjustments
  add constraint point_adjustments_delta_not_zero
  check (delta <> 0);

-- ---------------------------------------------------------------------------
-- 4. Index de consultation
-- ---------------------------------------------------------------------------

create index if not exists admin_actions_entity_idx
  on admin_actions (entity_type, entity_id);

create index if not exists admin_actions_admin_idx
  on admin_actions (admin_id, created_at desc);

create index if not exists point_adjustments_season_user_idx
  on point_adjustments (season_id, user_id);

create index if not exists point_adjustments_round_idx
  on point_adjustments (round_id);

-- ---------------------------------------------------------------------------
-- 5. Le journal est public — mais le réglage peut le refermer
-- ---------------------------------------------------------------------------
-- La politique de 0003 ouvrait le journal à tout membre sans condition. On la
-- remplace par une politique qui respecte `admin_log.public`, tout en gardant
-- l'accès permanent à l'administration.

drop policy if exists admin_actions_read on admin_actions;

create policy admin_actions_read on admin_actions
  for select to authenticated
  using (
    public.is_admin()
    or (public.is_member() and public.setting_bool('admin_log.public', true))
  );

-- Les ajustements de points restent visibles de tous, sans condition : ils
-- pèsent sur le classement, les cacher n'aurait aucun sens.

-- ---------------------------------------------------------------------------
-- 6. Réglages de l'espace admin
-- ---------------------------------------------------------------------------

insert into app_settings (key, value) values
  -- Statut appliqué par défaut à un score saisi à la main.
  ('admin.manual_result_status',  '"official"'::jsonb),
  -- Raison pré-remplie du formulaire de saisie manuelle.
  ('admin.manual_result_reason',  '"Saisie manuelle : résultat officiel LNR"'::jsonb),
  -- Nombre de lignes affichées par page dans le journal.
  ('admin.journal_page_size',     '50'::jsonb),
  -- Recalcul automatique des points après une saisie de résultat.
  ('admin.recompute_after_result', 'true'::jsonb)
on conflict (key) do nothing;
