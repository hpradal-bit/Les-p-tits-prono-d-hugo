-- ============================================================================
-- 0038 — Les super-pouvoirs doivent produire leur effet dès la fin DU match
-- qu'ils visent, pas seulement à la clôture manuelle de toute la journée.
-- ----------------------------------------------------------------------------
-- Audit demandé par Hugo (bug rapporté : un pouvoir choisi n'avait "pas
-- réellement d'impact sur mes points" une fois le match terminé).
--
-- Cause : `resolveRoundPowers` (résolution des pouvoirs) n'était jamais
-- appelée que par `settleRound`, la clôture manuelle et complète d'une
-- journée — alors que le score d'un pronostic, lui, est déjà calculé match
-- par match dès que son résultat est connu (`recomputeFixtures`). Un Joker
-- sur un match terminé isolément restait donc sans le moindre effet tant que
-- l'admin ne clôturait pas toute la journée, parfois des jours plus tard.
--
-- Le champ `powers.config.resolves_at` existait déjà (posé sur joker/duel dès
-- la migration 0004) mais n'était lu par aucun code : une intention de design
-- jamais câblée. Le code applicatif le lit désormais pour décider s'il résout
-- un pouvoir dès la fin de SON match (`fixture_finished`) ou seulement à la
-- clôture de toute la journée (`round_settled`, réservé à Duel : son calcul a
-- besoin du total de la journée entière des deux joueurs).
-- ============================================================================

update powers set
  config = config || jsonb_build_object('resolves_at', 'fixture_finished')
where code in ('joker', 'oracle', 'sabotage', 'spy');

-- Duel reste explicite (déjà "round_settled" depuis 0004) : son résultat ne
-- peut se calculer qu'une fois le total de la journée connu pour les deux
-- joueurs, pas à la fin d'un seul match.
update powers set
  config = config || jsonb_build_object('resolves_at', 'round_settled')
where code = 'duel';

-- ----------------------------------------------------------------------------
-- Un seul pouvoir actif par joueur et par journée — garanti par la base, pas
-- seulement par la vérification applicative avant l'insertion (fenêtre de
-- course possible entre la lecture et l'écriture en cas de double clic ou de
-- double requête). L'index est partiel : une fois résolu ou annulé, une
-- utilisation ne compte plus, un joueur peut donc réutiliser un pouvoir à la
-- journée suivante sans être bloqué par les traces des précédentes.
-- ----------------------------------------------------------------------------
create unique index if not exists power_usages_one_active_per_round
  on power_usages (initiator_id, round_id)
  where state in ('declared', 'accepted');
