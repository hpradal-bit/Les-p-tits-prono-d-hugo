-- ============================================================================
-- 0040 — Le Duel se rejoue : mieux classé OU à égalité de points, pas
-- n'importe qui (revient sur la migration 0039)
-- ----------------------------------------------------------------------------
-- Hugo a d'abord demandé "n'importe qui" (0039), puis s'est ravisé : le Duel
-- doit rester réservé à un adversaire mieux classé ou à égalité de points,
-- jamais quelqu'un de moins bien classé.
--
-- Nouvelle valeur de target_rule lue par src/lib/powers/kinds/duel.ts :
-- "better_or_equal_ranked" — deux joueurs à égalité de points partagent déjà
-- la même position dans le moteur de classement, donc "mieux classé ou à
-- égalité" se lit simplement position cible <= position de l'attaquant.
-- ============================================================================

update powers set
  config = config || jsonb_build_object('target_rule', 'better_or_equal_ranked')
where code = 'duel';
