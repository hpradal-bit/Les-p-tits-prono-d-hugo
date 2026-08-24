-- ============================================================================
-- 0024 — ESPN en premier partout
-- ----------------------------------------------------------------------------
-- La 0022 confiait le classement à API-Sports, ESPN renvoyant le tableau de la
-- saison précédente. Le premier appel réel a montré pourquoi ce n'était pas la
-- bonne réponse :
--
--     [apisports] Free plans do not have access to this season,
--                 try from 2022 to 2024.
--
-- L'offre gratuite s'arrête à 2024. Placer API-Sports en tête gaspillait une
-- requête à chaque passage pour un refus certain, et l'espace admin annonçait
-- un secours qui n'existait pas.
--
-- Il reste dans la chaîne : il ne coûte rien tant qu'on ne l'appelle pas, et
-- cet ordre se change en une ligne le jour d'un abonnement payant.
-- ============================================================================

update app_settings
set value = '{
     "calendar":  ["espn", "apisports"],
     "live":      ["espn", "apisports"],
     "standings": ["espn", "apisports"]
   }'::jsonb,
    updated_at = now()
where key = 'sync.provider_order';
