-- ============================================================================
-- 0070 — Un même pouvoir, une fois par MATCH — pas par journée.
-- ----------------------------------------------------------------------------
-- Précision de l'hôte après la 0068/0069 : plusieurs utilisations du même
-- pouvoir sur une même journée restent autorisées (deux Oracle le même
-- week-end, par exemple, chacun sur un match différent) — seule la RÉPÉTITION
-- SUR LE MÊME MATCH doit être bloquée (deux Oracle sur Toulouse–Bayonne,
-- disons). Toujours sous le quota par pouvoir et par saison (3 crédits,
-- inchangé).
--
-- `power_usages` ne porte pas de colonne `fixture_id` dédiée — le match visé
-- vit dans `snapshot_before->>'fixtureId'` (cf. `declarePower`,
-- src/lib/powers/actions.ts). L'index est donc sur cette expression, partiel
-- sur les états consommateurs ET sur les pouvoirs qui visent effectivement un
-- match (`fixtureId` non nul) — le Duel ou le Joker, qui n'en visent aucun,
-- ne sont jamais concernés.
-- ============================================================================

create unique index if not exists power_usages_one_per_power_per_fixture
  on power_usages (initiator_id, power_id, (snapshot_before->>'fixtureId'))
  where state in ('declared', 'accepted', 'resolved')
    and (snapshot_before->>'fixtureId') is not null;
