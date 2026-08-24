-- ============================================================================
-- 0027 — Référence TheSportsDB pour la Pro D2
-- ----------------------------------------------------------------------------
-- Ligue 5172, même format « leagueId:season » que le Top 14 (4430:2026-2027).
-- Avec cette entrée, la Pro D2 bénéficie aussi du fournisseur principal.
-- ============================================================================

insert into external_refs (provider, entity_type, entity_id, external_id, payload)
select 'thesportsdb', 'season', s.id, '5172:2026-2027',
       jsonb_build_object(
         'format', 'ligue:saison',
         'leagueId', 5172,
         'leagueName', 'French Pro D2'
       )
from seasons s
join competitions c on c.id = s.competition_id
where c.code = 'prod2' and s.label = '2026/2027'
on conflict (provider, entity_type, entity_id) do nothing;

insert into external_refs (provider, entity_type, entity_id, external_id, payload)
select 'thesportsdb', 'competition', c.id, '5172',
       jsonb_build_object(
         'leagueName', 'French Pro D2',
         'page', 'thesportsdb.com/league/5172-french-pro-d2'
       )
from competitions c
where c.code = 'prod2'
on conflict (provider, entity_type, entity_id) do nothing;
