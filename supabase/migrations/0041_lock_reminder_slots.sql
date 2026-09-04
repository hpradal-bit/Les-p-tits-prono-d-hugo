-- ============================================================================
-- 0041 — Deux rappels avant verrouillage, entièrement personnalisables
-- ----------------------------------------------------------------------------
-- Demande explicite d'Hugo : deux créneaux (délai + texte), réglables depuis
-- l'espace admin, enregistrés une fois pour toutes et appliqués
-- automatiquement à chaque match — sans reprogrammation manuelle.
--
-- Avant cette migration, un seul délai existait
-- (notifications.reminder_hours_before_lock), jamais réglable depuis l'admin
-- (aucun écran ne l'exposait), et son texte était fixe dans le code. Les deux
-- créneaux ci-dessous le remplacent.
-- ============================================================================

insert into app_settings (key, value)
values (
  'notifications.lock_reminder_slots',
  '[
    {"id":"slot_1","enabled":true,"hoursBefore":24,"title":"⏰ Encore {heures} h avant la fermeture","body":"N''oublie pas de faire tes pronos pour {journee} !"},
    {"id":"slot_2","enabled":true,"hoursBefore":10,"title":"⏰ Dernière ligne droite","body":"Il te reste {restant} prono(s) à jouer avant la fermeture de {journee}."}
  ]'::jsonb
)
on conflict (key) do nothing;

-- La description mentionnait un délai fixe ("trois heures") qui n'a plus de
-- sens : le délai est désormais réglable, et il y en a deux.
update app_settings
set value = (
  select jsonb_agg(
    case when entry->>'kind' = 'lock_reminder'
      then entry || jsonb_build_object(
        'description',
        'Avant la fermeture des pronos, s''il t''en manque — deux créneaux réglables depuis Notifications.'
      )
      else entry
    end
  )
  from jsonb_array_elements(value) as entry
)
where key = 'notifications.types';
