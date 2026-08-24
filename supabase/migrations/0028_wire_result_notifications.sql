-- ============================================================================
-- 0028 — Brancher les notifications de résultat
-- ============================================================================
-- Deux types branchés :
--
--   · `exact_score` (existant, était `wired: false`) — quand quelqu'un
--     décroche un score exact. Spectaculaire et rare : exactement le genre
--     de notification qu'un joueur veut recevoir.
--
--   · `fixture_result` (nouveau) — quand un match se termine, chaque joueur
--     reçoit le résultat. Regroupé par match : sept matchs ne font pas sept
--     notifications, la clé de dédoublonnage s'en charge.
-- ============================================================================

-- Brancher exact_score : passer wired de false à true.
update app_settings
set value = (
  select jsonb_agg(
    case
      when elem->>'kind' = 'exact_score'
      then jsonb_set(elem, '{wired}', 'true'::jsonb)
      else elem
    end
  )
  from jsonb_array_elements(value) as elem
),
updated_at = now()
where key = 'notifications.types'
  and value @> '[{"kind":"exact_score","wired":false}]'::jsonb;

-- Ajouter fixture_result s'il n'existe pas encore.
update app_settings
set value = value || '[
      {"kind":"fixture_result","emoji":"🏉","label":"Résultat de match",
       "description":"Quand un match se termine : le score final.",
       "default_enabled":true,"wired":true}
    ]'::jsonb,
    updated_at = now()
where key = 'notifications.types'
  and not (value @> '[{"kind":"fixture_result"}]'::jsonb);
