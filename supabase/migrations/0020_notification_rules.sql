-- ============================================================================
-- 0020 — Annonces et garde-fous réglables
-- ============================================================================
-- Deux manques comblés ici :
--
--   1. `notifications.enabled` était semé par la 0016 mais lu nulle part :
--      l'interrupteur général existait sans rien couper. Il est désormais
--      honoré par `enqueue`. Aucune migration n'est nécessaire pour ça — la
--      note est ici parce que c'est le genre d'écart qu'on ne retrouve pas.
--
--   2. Il n'existait aucun moyen d'écrire un message à la main. Le type
--      `announcement` est ajouté au catalogue, branché (`wired: true`), et
--      c'est le seul que l'administration peut composer librement.
--
-- Les garde-fous (plafond, heures de silence, fuseau) vivaient déjà en base :
-- ils deviennent modifiables depuis l'espace admin, sans nouvelle colonne.
-- ============================================================================

-- Les clés attendues par l'écran d'administration. `do nothing` : une base déjà
-- réglée garde ses valeurs, on ne réécrase jamais un choix de l'admin.
insert into app_settings (key, value) values
  ('notifications.enabled',     'true'::jsonb),
  ('notifications.timezone',    '"Europe/Paris"'::jsonb),
  ('notifications.max_per_day', '3'::jsonb),
  ('notifications.quiet_from',  '"22:00"'::jsonb),
  ('notifications.quiet_to',    '"08:00"'::jsonb)
on conflict (key) do nothing;

-- Le type « annonce », ajouté au catalogue s'il n'y est pas déjà.
-- La condition rend la migration rejouable sans créer de doublon.
update app_settings
set value = value || '[
      {"kind":"announcement","emoji":"📣","label":"Message de l''organisation",
       "description":"Un mot écrit à la main : report d''un match, règle du jour, tirage au sort.",
       "default_enabled":true,"wired":true}
    ]'::jsonb,
    updated_at = now()
where key = 'notifications.types'
  and not (value @> '[{"kind":"announcement"}]'::jsonb);

comment on table app_settings is
  'Réglages applicatifs. Les garde-fous des notifications (notifications.enabled, '
  'max_per_day, quiet_from, quiet_to, timezone) se modifient depuis /admin/push-settings. '
  'Portée : le groupe entier. Le jour où plusieurs ligues coexistent, ces cinq clés '
  'passent dans une table par groupe — les lectures sont déjà centralisées dans '
  'src/lib/push/rules.ts.';
