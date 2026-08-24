-- ============================================================================
-- 0022 — Ordre de préférence des fournisseurs, par nature de synchronisation
-- ----------------------------------------------------------------------------
-- La première synchronisation réelle a montré qu'il n'existe pas de « meilleur
-- fournisseur » dans l'absolu :
--
--   · le calendrier d'ESPN était irréprochable — 182 matchs, les 14 clubs
--     rapprochés du premier coup ;
--   · son classement renvoyait le tableau final de la saison précédente.
--
-- Le quota interdit par ailleurs de tout confier à API-Sports : 100 requêtes
-- par jour contre 288 réveils du planificateur les jours de match. Le direct
-- l'épuiserait avant la mi-temps, et le secours ne serait plus là quand il
-- servirait vraiment.
--
-- D'où un ordre par nature. Modifiable sans redéploiement (règle n° 1) : le
-- jour où un fournisseur se dégrade, la réparation est une ligne de réglage.
-- ============================================================================

insert into app_settings (key, value) values (
  'sync.provider_order',
  '{
     "calendar":  ["espn", "apisports"],
     "live":      ["espn", "apisports"],
     "standings": ["apisports", "espn"]
   }'::jsonb
)
on conflict (key) do nothing;
