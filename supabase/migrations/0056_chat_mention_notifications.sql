-- « @Untel » dans Chambrage : un joueur interpellé directement mérite sa
-- propre notification, distincte du message générique et de la réponse
-- (règle n° 1 : rien en dur, le catalogue et son interrupteur vivent dans
-- `app_settings`, comme les trois autres types de notification de Chambrage
-- posés en 0052).
update app_settings
set value = value || '[
      {"kind":"chat_mention","emoji":"🔔","label":"Mentionné dans Chambrage",
       "description":"Quand quelqu''un t''interpelle avec @Ton_pseudo.",
       "default_enabled":true,"wired":true}
    ]'::jsonb,
    updated_at = now()
where key = 'notifications.types'
  and not (value @> '[{"kind":"chat_mention"}]'::jsonb);
