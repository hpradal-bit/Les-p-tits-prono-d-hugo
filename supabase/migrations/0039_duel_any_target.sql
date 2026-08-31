-- ============================================================================
-- 0039 — Le Duel peut défier n'importe qui, pas seulement un joueur mieux classé
-- ----------------------------------------------------------------------------
-- Demande explicite d'Hugo : le Duel doit être utilisable contre un joueur
-- mieux classé, à égalité de points, ou moins bien classé.
--
-- `target_rule` pilote déjà ce comportement côté code (src/lib/powers/kinds/
-- duel.ts) sans qu'aucun redéploiement ne soit nécessaire pour le changer :
-- seule la valeur "better_ranked_only" restreint les cibles ; toute autre
-- valeur les laisse toutes ouvertes.
-- ============================================================================

update powers set
  config = config || jsonb_build_object('target_rule', 'any')
where code = 'duel';
