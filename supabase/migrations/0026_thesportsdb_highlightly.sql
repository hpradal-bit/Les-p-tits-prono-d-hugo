-- ============================================================================
-- 0026 — TheSportsDB (principal) + Highlightly (second) + nouvel ordre
-- ----------------------------------------------------------------------------
-- TheSportsDB : 30 req/min, pas de quota journalier, données décalées de
-- 5-10 min sur l'offre gratuite. Couvre Top 14 (ligue 4430) et Pro D2 (5172).
--
-- Highlightly : 100 req/jour en gratuit via RapidAPI. API structurée, couvre
-- le Top 14 et 100+ compétitions de rugby.
--
-- Nouvel ordre : TheSportsDB → Highlightly → ESPN → API-Sports.
-- ============================================================================

-- 1. Référence externe TheSportsDB pour le Top 14 (saison)
-- Le format du seasonExternalId est « leagueId:season », comme API-Sports.
insert into external_refs (provider, entity_type, entity_id, external_id, payload)
select 'thesportsdb', 'season', s.id, '4430:2026-2027',
       jsonb_build_object(
         'format', 'ligue:saison',
         'leagueId', 4430,
         'leagueName', 'French Top 14',
         'note', 'Clé 123 = offre gratuite partagée. Patreon $3/mois pour une clé dédiée.'
       )
from seasons s
join competitions c on c.id = s.competition_id
where c.code = 'top14' and s.label = '2026/2027'
on conflict (provider, entity_type, entity_id) do nothing;

-- 2. Référence TheSportsDB pour la compétition Top 14
insert into external_refs (provider, entity_type, entity_id, external_id, payload)
select 'thesportsdb', 'competition', c.id, '4430',
       jsonb_build_object(
         'leagueName', 'French Top 14',
         'page', 'thesportsdb.com/league/4430-french-top-14'
       )
from competitions c
where c.code = 'top14'
on conflict (provider, entity_type, entity_id) do nothing;

-- 3. Mettre à jour l'ordre des fournisseurs
update app_settings
set value = '{
  "calendar":  ["thesportsdb", "highlightly", "espn", "apisports"],
  "live":      ["thesportsdb", "highlightly", "espn", "apisports"],
  "standings": ["thesportsdb", "highlightly", "espn", "apisports"]
}'::jsonb
where key = 'sync.provider_order';

-- 4. Quota Highlightly (modifiable depuis l'admin)
insert into app_settings (key, value)
values ('sync.highlightly_daily_quota', '100'::jsonb)
on conflict (key) do nothing;
