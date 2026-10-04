-- ============================================================================
-- 0066 — Un joueur peut activer PLUSIEURS super-pouvoirs différents (ou le
-- même plusieurs fois) sur la même journée : seul le quota propre à chaque
-- pouvoir (3 crédits par pouvoir et par saison, `powers.config.max_uses_per_player`,
-- vérifié par `loadUsageCounts`/`buildQuotas`/`quotaRefusal` dans
-- `src/lib/powers/actions.ts`) doit continuer à limiter l'usage — jamais un
-- plafond "un seul pouvoir actif à la fois" qui n'a aucun sens pour le jeu.
-- ----------------------------------------------------------------------------
-- Demande explicite de l'hôte : Hugo, bloqué par cette règle, ne pouvait pas
-- activer un second pouvoir pour tenter de renverser son Duel en cours contre
-- Pierre, alors qu'il avait encore des crédits disponibles sur un autre
-- pouvoir. L'index posé par la migration 0038 empêchait ça au niveau base,
-- en plus du refus applicatif correspondant (`loadUserRoundUsage` dans
-- `src/lib/powers/queries.ts`, retiré dans le même correctif) : les deux
-- doivent disparaître ensemble, sinon la base continuerait de rejeter la
-- déclaration même après le correctif applicatif.
-- ============================================================================

drop index if exists power_usages_one_active_per_round;
