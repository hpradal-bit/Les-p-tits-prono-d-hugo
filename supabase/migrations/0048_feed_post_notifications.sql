-- Un message du Vestiaire réveille le groupe.
--
-- Le fil vivait en silence : quelqu'un chambrait, et personne ne le savait
-- avant d'ouvrir l'application de lui-même. On déclare donc le type au
-- catalogue, avec son interrupteur comme les autres — chaque joueur reste
-- libre de le couper depuis ses réglages.
--
-- La condition rend la migration rejouable sans créer de doublon.

update app_settings
set value = value || '[
      {"kind":"feed_post","emoji":"💬","label":"Message dans le Chambrage",
       "description":"Quand quelqu''un publie un mot dans le Vestiaire.",
       "default_enabled":true,"wired":true}
    ]'::jsonb,
    updated_at = now()
where key = 'notifications.types'
  and not (value @> '[{"kind":"feed_post"}]'::jsonb);

-- Les crédits n'existent plus : chaque pouvoir a son quota d'utilisations.
delete from app_settings
where key in ('powers.credits_per_player', 'powers.default_credit_cost');

-- La ligne de départ des quotas. Absente, tout l'historique compte ; posée,
-- seules les utilisations postérieures sont décomptées. C'est ce que fait le
-- bouton « Remettre tous les compteurs à neuf » de l'espace admin.
comment on table app_settings is
  'Réglages applicatifs. powers.quota_reset_at porte la dernière remise à zéro '
  'des compteurs de super-pouvoirs : les utilisations antérieures restent dans '
  'power_usages (le fil et l''historique les racontent toujours) mais ne '
  'consomment plus de quota.';
