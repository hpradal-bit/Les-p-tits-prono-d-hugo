-- ============================================================================
-- 0068 — Un même pouvoir ne peut être joué qu'une fois par journée.
-- ----------------------------------------------------------------------------
-- Règle demandée par l'hôte : un joueur peut activer, la même journée, autant
-- de pouvoirs DIFFÉRENTS qu'il veut (Oracle, Joker ET Espion le même
-- week-end, par exemple) — mais jamais deux fois LE MÊME pouvoir sur cette
-- journée (deux Oracle, ou deux Sabotage, le même week-end). Le quota par
-- pouvoir et par saison (3 crédits, `powers.config.max_uses_per_player`)
-- continue de s'appliquer par-dessus, inchangé.
--
-- Garanti par la base, pas seulement par la vérification applicative avant
-- l'insertion (`src/lib/powers/actions.ts`, `declarePower`) : fenêtre de
-- course possible entre la lecture et l'écriture en cas de double clic ou de
-- double requête — exactement la même raison que l'index `declarant unique
-- actif par journée` de la migration 0038 (retiré depuis, migration 0066,
-- parce qu'il portait sur UN pouvoir actif au lieu de MÊME pouvoir) : l'un
-- est plus large que l'autre, mais le besoin d'un filet côté base reste
-- identique.
--
-- Les mêmes états que le quota (`CONSUMING_STATES` dans
-- `src/lib/powers/quota.ts`) comptent ici : `declared`, `accepted`,
-- `resolved`. Une déclaration `cancelled` n'a jamais eu lieu, elle ne bloque
-- rien — un joueur qui annule une déclaration peut reposer le même pouvoir
-- sur la même journée.
-- ============================================================================

create unique index if not exists power_usages_one_per_power_per_round
  on power_usages (initiator_id, power_id, round_id)
  where state in ('declared', 'accepted', 'resolved');
