-- Rattrapage : les pouvoirs déjà annoncés sur des matchs pas encore joués.
--
-- La règle « un pouvoir déclaré ne se raconte qu'une fois son match commencé »
-- filtrait à la projection : elle empêchait une NOUVELLE publication de
-- naître, mais laissait vivre celles créées avant son existence. Un Sabotage
-- annoncé pour la J3 restait donc affiché la veille des matchs — exactement
-- ce que la règle devait empêcher.
--
-- Deux réparations, dans cet ordre.

-- 1. Le match visé, réinscrit dans les événements qui l'avaient perdu.
--
-- Il a toujours été connu de `power_usages.snapshot_before`, mais les premiers
-- événements ne le recopiaient pas dans leur charge utile. Sans lui, la règle
-- se rabat sur le premier match de la journée — et révélerait un pouvoir posé
-- sur le match du dimanche soir dès le coup d'envoi du samedi après-midi.
-- Ajouter ce fait n'est pas réécrire l'histoire : il était vrai depuis le
-- premier jour.
with apparie as (
  select e.id as event_id,
         (pu.snapshot_before->>'fixtureId') as fixture_id
  from events e
  join power_usages pu
    on pu.initiator_id = e.actor_id
   and pu.round_id = e.round_id
   and pu.target_id is not distinct from e.target_id
  join powers p on p.id = pu.power_id
  where e.kind = 'power_declared'
    and p.code = e.payload->>'power_code'
    and (e.payload->>'fixture_id') is null
    and (pu.snapshot_before->>'fixtureId') is not null
)
update events e
set payload = e.payload || jsonb_build_object('fixture_id', apparie.fixture_id)
from apparie
where e.id = apparie.event_id;

-- 2. Les publications à retirer du fil.
--
-- Rien n'est perdu : l'événement reste en base, et la projection recréera la
-- publication d'elle-même une fois le coup d'envoi passé.
delete from feed_posts fp
using events e
left join fixtures f on f.id = (e.payload->>'fixture_id')::uuid
left join lateral (
  select min(kickoff_at) as debut from fixtures where round_id = e.round_id
) r on true
where e.id = fp.event_id
  and e.kind = 'power_declared'
  and coalesce(f.kickoff_at, r.debut) > now();
