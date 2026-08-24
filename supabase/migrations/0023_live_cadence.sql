-- ============================================================================
-- 0023 — Cadence du relevé des scores
-- ----------------------------------------------------------------------------
-- Un relevé toutes les 5 minutes pendant les matchs représente environ 123
-- appels sur un samedi de Top 14 — au-delà des 100 requêtes quotidiennes
-- d'API-Sports. Tant qu'ESPN répond, cela n'a pas de conséquence : il n'a pas
-- de quota. Mais le jour où il tombe en plein après-midi, la chaîne bascule et
-- le secours s'épuise vers 17 h, laissant la fin de journée sans personne.
--
-- Dix minutes ramènent la journée à ~69 appels, sans rien perdre d'utile : un
-- score de rugby ne bouge pas assez vite pour que cinq minutes de retard se
-- remarquent.
--
-- Le code sait par ailleurs ralentir seul (`paceToQuota`) quand le fournisseur
-- qui répond a un quota. Ce réglage est la première ligne de défense, pas la
-- seule.
-- ============================================================================

update app_settings
set value = '10'::jsonb, updated_at = now()
where key = 'sync.live_interval_minutes'
  and value = '5'::jsonb;
