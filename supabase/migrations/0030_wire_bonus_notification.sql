-- ============================================================================
-- 0030 — Brancher la notification bonus_question
-- ============================================================================
-- Dernier type du catalogue : passe de wired: false à wired: true.
-- Le code qui l'émet est dans src/lib/bonus/actions.ts (openBonusQuestion).
-- ============================================================================

update app_settings
set value = (
  select jsonb_agg(
    case
      when elem->>'kind' = 'bonus_question'
      then jsonb_set(elem, '{wired}', 'true'::jsonb)
      else elem
    end
  )
  from jsonb_array_elements(value) as elem
),
updated_at = now()
where key = 'notifications.types'
  and value @> '[{"kind":"bonus_question","wired":false}]'::jsonb;
