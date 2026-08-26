-- ============================================================================
-- 0034 — Ligues privées (deuxième incrément) : navigation et classement
-- ----------------------------------------------------------------------------
-- 0033 posait les fondations (tables, RLS sur profils/pronostics). Cette
-- migration cloisonne la dernière fonction encore assise sur l'ancien groupe
-- unique : `round_participation`, qui alimente « qui n'a pas encore joué »
-- sur /journee. Elle joignait `group_members` (tout le monde) ; elle joint
-- maintenant `league_members` pour une ligue précise, et refuse de répondre
-- à qui n'en est pas membre — même garde-fou que `is_member()` avant elle.
-- ============================================================================

drop function if exists public.round_participation(uuid);

create or replace function public.round_participation(p_round_id uuid, p_league_id uuid)
returns table (
  user_id      uuid,
  first_name   text,
  display_name text,
  avatar_kind  avatar_kind,
  avatar_value text,
  played       integer,
  total        integer,
  missing      integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  if not public.is_league_member(p_league_id) then
    raise exception 'Réservé aux membres de la ligue.' using errcode = '42501';
  end if;

  select count(*) into v_total from fixtures where round_id = p_round_id;

  return query
  select
    p.id,
    p.first_name,
    p.display_name,
    p.avatar_kind,
    p.avatar_value,
    count(pr.id)::integer,
    v_total,
    greatest(v_total - count(pr.id)::integer, 0)
  from profiles p
  join league_members lm on lm.user_id = p.id and lm.league_id = p_league_id
  left join predictions pr
    on pr.user_id = p.id
   and pr.fixture_id in (select f.id from fixtures f where f.round_id = p_round_id)
  where p.is_active
  group by p.id, p.first_name, p.display_name, p.avatar_kind, p.avatar_value
  order by p.first_name;
end;
$$;

revoke all on function public.round_participation(uuid, uuid) from public;
grant execute on function public.round_participation(uuid, uuid) to authenticated;
