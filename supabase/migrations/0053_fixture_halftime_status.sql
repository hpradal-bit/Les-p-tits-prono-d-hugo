-- Distingue la mi-temps du reste du direct.
--
-- Les fournisseurs (API-Sports "HT", TheSportsDB/Highlightly "ht") savent
-- déjà dire qu'un match est à la mi-temps, mais le mapping actuel range ça
-- dans "live" comme le reste — impossible d'afficher "MI-TEMPS" plutôt que
-- "LIVE" à l'écran (demande explicite de Hugo). Valeur ajoutée à l'énumération
-- existante, jamais retirée : ALTER TYPE ... ADD VALUE ne se défait pas.
alter type fixture_status add value if not exists 'halftime';
