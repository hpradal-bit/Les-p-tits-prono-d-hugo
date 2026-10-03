-- Notification à la cible d'un pouvoir déclaré contre elle (Duel, Espion,
-- Sabotage) : jusqu'ici, `declarePower` ne mettait rien en file pour elle —
-- un vrai trou, pas un bug de livraison (rapport de l'hôte : Pierre, visé
-- par le Duel de Hugo, n'avait reçu absolument rien). Même convention que
-- les autres types (0052, 0056) : le catalogue et son interrupteur vivent
-- dans `app_settings`, rien en dur côté code.
update app_settings
set value = value || '[
      {"kind":"power_declared","emoji":"⚔️","label":"Pouvoir activé contre toi",
       "description":"Quand quelqu''un déclare un Duel, un Espion ou un Sabotage contre toi.",
       "default_enabled":true,"wired":true}
    ]'::jsonb,
    updated_at = now()
where key = 'notifications.types'
  and not (value @> '[{"kind":"power_declared"}]'::jsonb);
