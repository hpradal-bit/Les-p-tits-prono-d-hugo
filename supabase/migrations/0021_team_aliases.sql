-- ============================================================================
-- 0021 — Alias d'équipes pour le rapprochement automatique
-- ----------------------------------------------------------------------------
-- Le rapprochement par nom (`normalize.ts`) reconnaît déjà la grande majorité
-- des graphies. Trois lui échappent, et elles sont plausibles :
--
--     « Lyon OU »                     → aucun rapprochement
--     « Lyon Olympique Universitaire » → aucun rapprochement
--     « Racing Metro 92 »              → aucun rapprochement
--
-- Le seuil de confiance ne peut pas être abaissé pour les attraper : il tient
-- lieu de garde-fou, et un mauvais appariement fausserait les points de tout
-- le monde. La réponse prévue par la conception est cette table d'alias, que
-- l'administration peut compléter sans redéploiement (règle n° 1).
--
-- Un match non rapproché le jour de la J1, c'est un score saisi à la main.
-- D'où ces graphies posées à l'avance plutôt qu'en catastrophe le soir venu.
--
-- Les clés sont normalisées à la lecture (`buildAliasIndex`) : la casse, les
-- accents et la ponctuation n'ont donc pas d'importance ici. Les valeurs sont
-- nos codes d'équipe, tels qu'ils figurent dans `teams.code`.
-- ============================================================================

update app_settings
set value = '{
  "Lyon OU": "LOU",
  "Lyon Olympique Universitaire": "LOU",
  "LOU Rugby Lyon": "LOU",
  "Racing Metro 92": "R92",
  "Racing Metro": "R92",
  "Racing Club de France 92": "R92",
  "ASM Clermont": "ASM",
  "Clermont Auvergne Rugby": "ASM",
  "Aviron Bayonnais Rugby Pro": "BAY",
  "Castres Olympique Rugby": "CO",
  "Montpellier Herault SR": "MHR",
  "Montpellier Rugby Club": "MHR",
  "RC Toulonnais": "RCT",
  "Rugby Club Vannetais": "RCV",
  "Vannes RC": "RCV",
  "Section Paloise Bearn Pyrenees": "SP",
  "Pau Section Paloise": "SP",
  "Paris Stade Francais": "SFP",
  "Stade Francais Paris Rugby": "SFP",
  "Atlantique Stade Rochelais": "SR",
  "Stade Rochelais Rugby": "SR",
  "Stade Toulousain Rugby": "ST",
  "Union Bordeaux Begles Rugby": "UBB",
  "USA Perpignan Rugby": "USAP",
  "Perpignan USAP": "USAP"
}'::jsonb || coalesce(value, '{}'::jsonb)
where key = 'sync.team_aliases';

-- `|| coalesce(value, …)` et non l'inverse : un alias ajouté à la main par
-- l'administration l'emporte sur ceux posés ici. On complète son travail, on
-- ne l'écrase pas.

insert into app_settings (key, value)
select 'sync.team_aliases', '{}'::jsonb
where not exists (select 1 from app_settings where key = 'sync.team_aliases');
