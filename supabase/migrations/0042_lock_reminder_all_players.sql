-- ============================================================================
-- 0042 — Les rappels partent maintenant à tous les joueurs, pas seulement à
-- ceux à qui il manque un pronostic
-- ----------------------------------------------------------------------------
-- Demande explicite d'Hugo. Aucune colonne ni structure ne change : le mode
-- "heure précise" (config.mode / daysBefore / clockTime) ajouté côté code se
-- lit avec des valeurs de repli tant qu'un créneau n'a pas été réenregistré
-- depuis l'espace admin — pas de migration de données nécessaire pour ça.
-- Seule la description, encore exacte avant ce changement, est corrigée ici.
-- ============================================================================

update app_settings
set value = (
  select jsonb_agg(
    case when entry->>'kind' = 'lock_reminder'
      then entry || jsonb_build_object(
        'description',
        'Avant la fermeture des pronos — deux créneaux réglables depuis Notifications, envoyés à tous les joueurs.'
      )
      else entry
    end
  )
  from jsonb_array_elements(value) as entry
)
where key = 'notifications.types';
