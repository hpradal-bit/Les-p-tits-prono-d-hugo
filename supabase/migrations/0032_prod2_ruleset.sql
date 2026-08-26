-- ============================================================================
-- 0032 — Barème pour la Pro D2
-- ----------------------------------------------------------------------------
-- La saison Pro D2 (0025) n'a jamais reçu de barème : `scoring_rulesets` et
-- `margin_buckets` sont scopés par saison / barème, jamais partagés entre
-- compétitions. Sans cette ligne, toute page qui calcule ou affiche un
-- pronostic Pro D2 échoue avec « Aucun barème pour la saison … » — c'est ce
-- qui a fait tomber /journee?ligue=prod2 le 26 août, découvert en testant
-- avant le match de jeudi.
--
-- On copie le barème du Top 14 tel qu'il est en vigueur : les deux
-- compétitions jouent au même rugby, avec la même cascade de score (règle du
-- CLAUDE.md), rien ne justifie un barème différent pour un banc d'essai.
-- L'admin peut toujours l'ajuster ensuite depuis Admin → Barème, comme pour
-- n'importe quelle saison.
--
-- Idempotent : si la Pro D2 a déjà un barème, rien n'est inséré.
-- ============================================================================

with top14_ruleset as (
  select r.id, r.rules
  from scoring_rulesets r
  join seasons s on s.id = r.season_id
  join competitions c on c.id = s.competition_id
  where c.code = 'top14'
  order by r.effective_from desc
  limit 1
),
prod2_season as (
  select s.id
  from seasons s
  join competitions c on c.id = s.competition_id
  where c.code = 'prod2'
  order by s.starts_on desc
  limit 1
),
inserted as (
  insert into scoring_rulesets (season_id, version, label, effective_from, rules)
  select ps.id, 1, 'Barème de départ', now(), tr.rules
  from prod2_season ps, top14_ruleset tr
  where not exists (select 1 from scoring_rulesets e where e.season_id = ps.id)
  returning id
)
insert into margin_buckets (ruleset_id, position, min_points, max_points, label)
select ins.id, mb.position, mb.min_points, mb.max_points, mb.label
from inserted ins
cross join top14_ruleset tr
join margin_buckets mb on mb.ruleset_id = tr.id;
