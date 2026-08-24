-- ============================================================================
-- 0029 — Brancher les notifications de classement
-- ============================================================================
-- Deux types passent de `wired: false` à `wired: true` :
--
--   · `leader_change` — quand la tête du classement change de main.
--     Spectaculaire et rare : tout le groupe est prévenu.
--
--   · `overtake` — quand un joueur en double un autre.
--     Seul le joueur doublé reçoit la notification.
--
-- Le code qui les émet est dans `src/lib/push/standings.ts`, branché depuis
-- la route `/api/sync/live` après le calcul des points.
-- ============================================================================

-- Brancher leader_change : passer wired de false à true.
update app_settings
set value = (
  select jsonb_agg(
    case
      when elem->>'kind' = 'leader_change'
      then jsonb_set(elem, '{wired}', 'true'::jsonb)
      else elem
    end
  )
  from jsonb_array_elements(value) as elem
),
updated_at = now()
where key = 'notifications.types'
  and value @> '[{"kind":"leader_change","wired":false}]'::jsonb;

-- Brancher overtake : passer wired de false à true.
update app_settings
set value = (
  select jsonb_agg(
    case
      when elem->>'kind' = 'overtake'
      then jsonb_set(elem, '{wired}', 'true'::jsonb)
      else elem
    end
  )
  from jsonb_array_elements(value) as elem
),
updated_at = now()
where key = 'notifications.types'
  and value @> '[{"kind":"overtake","wired":false}]'::jsonb;
