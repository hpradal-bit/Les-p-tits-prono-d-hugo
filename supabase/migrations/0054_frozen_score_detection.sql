-- Détecte un score gelé chez le fournisseur PENDANT la fenêtre de match, pas
-- seulement une fois qu'elle s'est refermée.
--
-- `findStaleFixtures` (migration 0044) ne regarde qu'APRÈS
-- `sync.match_window_minutes` (coup d'envoi + 135 min) : c'est exactement ce
-- qui avait laissé passer l'incident du 16 septembre pendant toute une
-- mi-temps et une seconde période avant d'être repéré. `findFrozenFixtures`
-- comble l'angle mort : un match encore `live`/`halftime` dont
-- `fixtures.last_synced_at` n'a plus bougé depuis ce délai (alors qu'on est
-- toujours dans sa fenêtre) remonte en avertissement dans `sync_runs`, en
-- direct plutôt que le lendemain.
insert into app_settings (key, value)
values (
  'sync.frozen_after_minutes',
  '20'::jsonb
)
on conflict (key) do nothing;
