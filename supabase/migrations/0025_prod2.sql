-- ============================================================================
-- 0025 — Pro D2, pour éprouver la chaîne avant le Top 14
-- ----------------------------------------------------------------------------
-- Le Top 14 ne commence que le 5 septembre. D'ici là, rien ne permet de
-- vérifier ce qui compte vraiment : qu'un match se termine et que les points
-- tombent. La Pro D2 joue plus tôt, sur le même sport et le même barème — elle
-- sert de banc d'essai grandeur nature.
--
-- La saison est créée en `draft`, jamais en `active` : le Top 14 garde la main
-- sur ce que voient les joueurs. Le sélecteur de l'espace admin permet de la
-- synchroniser explicitement.
--
-- Aucune équipe n'est saisie ici. Depuis l'amorçage des effectifs, la première
-- synchronisation du calendrier crée les seize clubs à partir de ce que dit le
-- fournisseur — leurs vrais noms, plutôt qu'une liste devinée d'avance.
--
-- ⚠️ UNE SEULE VALEUR À RENSEIGNER : l'identifiant ESPN de la compétition.
--    Il se lit dans l'adresse d'une page de la compétition sur espn.com :
--      espn.com/rugby/scoreboard/_/league/<IDENTIFIANT>
--    Le Top 14 porte le 270559. Reporter celui de la Pro D2 ci-dessous, puis
--    lancer « Synchroniser le calendrier » en choisissant Pro D2 dans le
--    sélecteur de compétition.
-- ============================================================================

insert into competitions (sport_id, code, name, country)
select id, 'prod2', 'Pro D2', 'France' from sports where code = 'rugby'
on conflict (code) do nothing;

insert into seasons (competition_id, label, starts_on, ends_on, status)
select id, '2026/2027', date '2026-08-20', date '2027-06-30', 'draft'
from competitions where code = 'prod2'
on conflict (competition_id, label) do nothing;

-- L'identifiant ESPN. Tant qu'il vaut 'À RENSEIGNER', la synchronisation
-- répondra « aucune référence de saison » — un message clair, pas un silence.
insert into external_refs (provider, entity_type, entity_id, external_id, payload)
select 'espn', 'competition', id, 'À RENSEIGNER', '{"note": "identifiant ESPN de la Pro D2"}'::jsonb
from competitions where code = 'prod2'
on conflict (provider, entity_type, entity_id) do nothing;
