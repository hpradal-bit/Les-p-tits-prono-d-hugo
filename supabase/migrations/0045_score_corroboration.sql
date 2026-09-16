-- Recoupement du score avant le passage en « officiel ».
--
-- La chaîne de fournisseurs est un repli en cascade : le premier qui répond
-- gagne. TheSportsDB répondant toujours, Highlightly, ESPN et API-Sports
-- n'avaient jamais été interrogés — 521 appels en vingt jours, tous vers le
-- même fournisseur. Quand celui-ci a servi un score figé en pleine première
-- mi-temps, personne n'était là pour le contredire.
--
-- Le passage en « officiel » est le point de non-retour : après lui, la synchro
-- s'interdit de corriger le score. On exige donc qu'un second fournisseur,
-- indépendant du premier, dise la même chose avant de franchir ce pas.

-- Exiger un second avis concordant. Mettre à false rétablit l'ancien
-- comportement (le premier fournisseur fait foi).
insert into app_settings (key, value)
values ('sync.require_corroboration', 'true'::jsonb)
on conflict (key) do nothing;

-- Combien de dates recouper par passage. Le recoupement ne coûte une requête
-- que s'il y a réellement un match à officialiser : une date suffit à couvrir
-- une soirée de championnat.
insert into app_settings (key, value)
values ('sync.corroboration_max_dates_per_run', '1'::jsonb)
on conflict (key) do nothing;
