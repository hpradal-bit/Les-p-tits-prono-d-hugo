-- ============================================================================
-- 0069 — Retire la règle "un même pouvoir, une fois par journée" (migration
-- 0068), sur demande explicite de l'hôte, revenue sur sa décision le jour
-- même : un joueur peut de nouveau jouer le même pouvoir plusieurs fois sur
-- une même journée (par ex. deux Oracle), tant qu'il respecte le quota par
-- pouvoir et par saison (3 crédits, inchangé, jamais concerné par cette
-- règle ni par son retrait).
--
-- Même precédent que la migration 0066 (qui avait retiré l'index posé par la
-- 0038) : on ne supprime jamais un fichier de migration déjà appliqué en
-- production, on ajoute la migration qui annule son effet.
-- ============================================================================

drop index if exists power_usages_one_per_power_per_round;
