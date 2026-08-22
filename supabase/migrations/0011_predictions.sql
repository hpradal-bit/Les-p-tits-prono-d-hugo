-- ============================================================================
-- LES P'TITS PRONOS D'HUGO — Pronostics : verrouillage, score exact, participation
-- ----------------------------------------------------------------------------
-- Ce que cette migration garantit, indépendamment de ce que fait l'écran :
--
--   1. Un pronostic ne peut plus être posé ni modifié une fois `locks_at`
--      dépassé. La règle vit dans la base : même un appel direct à l'API
--      Supabase, avec un client bidouillé et une horloge mensongère, se fait
--      refuser. L'heure qui fait foi est celle du serveur, `now()`.
--   2. Le quota de scores exacts (N par match / journée / mois / saison, plus
--      une liste éventuelle de matchs imposés) est lu dans le barème en
--      vigueur et appliqué à l'écriture. Aucune valeur n'est en dur.
--   3. `is_auto` est réservé au serveur : un joueur ne peut pas faire passer
--      son pronostic pour un prono par défaut.
--   4. Toute écriture sur un pronostic laisse une trace dans
--      `prediction_audit`, sans exception.
--   5. On peut savoir combien de matchs chaque joueur a joués sur une journée
--      SANS rien apprendre du contenu de ses pronostics.
--
-- Convention : le serveur de confiance (clé service_role, tâches planifiées)
-- n'a pas de session, donc `auth.uid()` y est nul. C'est lui — et lui seul —
-- qui pose les pronos par défaut à l'instant même du verrouillage ; il n'est
-- donc pas soumis au garde-fou du point 1.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Fuseau horaire du jeu (sert à découper les périodes « mois »)
-- ---------------------------------------------------------------------------

insert into app_settings (key, value) values ('timezone', '"Europe/Paris"'::jsonb)
on conflict (key) do nothing;

create or replace function public.game_timezone()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value #>> '{}' from app_settings where key = 'timezone'),
    'Europe/Paris'
  );
$$;

comment on function public.game_timezone() is
  'Fuseau de référence du jeu, réglable depuis l''admin (app_settings.timezone).';

-- ---------------------------------------------------------------------------
-- 1. Le barème en vigueur pour un match donné
-- ---------------------------------------------------------------------------
-- Même sélection que loadRuleset() côté TypeScript : dernière version dont la
-- date d'effet est passée. Les deux doivent rester alignées.

create or replace function public.rules_for_fixture(p_fixture_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select rs.rules
  from fixtures f
  join rounds r on r.id = f.round_id
  join scoring_rulesets rs
    on rs.season_id = r.season_id
   and rs.effective_from <= now()
  where f.id = p_fixture_id
  order by rs.version desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 2. Le quota de scores exacts
-- ---------------------------------------------------------------------------
-- Un seul mécanisme couvre les six modes du cahier des charges :
--   désactivé            → quota 0
--   un par journée       → quota 1, period 'round'   (le réglage de départ)
--   match imposé         → quota 1 + imposed_fixture_ids
--   N par journée        → quota N
--   partout              → quota null (illimité)
--
-- `period = 'match'` veut dire « un quota par match » : la contrainte
-- d'unicité (user_id, fixture_id) suffit alors, il n'y a rien à compter
-- ailleurs.

create or replace function public.exact_score_state(p_user_id uuid, p_fixture_id uuid)
returns table (
  quota     integer,
  period    text,
  used      integer,
  remaining integer,
  eligible  boolean,   -- ce match fait-il partie des matchs autorisés ?
  allowed   boolean    -- éligible ET quota non épuisé
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rules    jsonb;
  v_quota    integer;
  v_period   text;
  v_imposed  jsonb;
  v_round    uuid;
  v_season   uuid;
  v_kickoff  timestamptz;
  v_tz       text;
  v_used     integer := 0;
  v_eligible boolean := true;
begin
  select f.round_id, r.season_id, f.kickoff_at
    into v_round, v_season, v_kickoff
  from fixtures f
  join rounds r on r.id = f.round_id
  where f.id = p_fixture_id;

  if v_round is null then
    -- Match inconnu : rien à autoriser, la clé étrangère se chargera du reste.
    return query select null::integer, 'round'::text, 0, null::integer, false, false;
    return;
  end if;

  v_rules := public.rules_for_fixture(p_fixture_id);

  -- Pas de barème : on n'invente pas de règle, on laisse passer.
  if v_rules is null then
    return query select null::integer, 'round'::text, 0, null::integer, true, true;
    return;
  end if;

  v_quota   := (v_rules -> 'exact_score' ->> 'quota')::integer;  -- null = illimité
  v_period  := coalesce(v_rules -> 'exact_score' ->> 'period', 'round');
  v_imposed := coalesce(v_rules -> 'exact_score' -> 'imposed_fixture_ids', '[]'::jsonb);
  v_tz      := public.game_timezone();

  if jsonb_typeof(v_imposed) = 'array' and jsonb_array_length(v_imposed) > 0 then
    v_eligible := v_imposed ? p_fixture_id::text;
  end if;

  select count(*)
    into v_used
  from predictions p
  join fixtures f2 on f2.id = p.fixture_id
  join rounds r2 on r2.id = f2.round_id
  where p.user_id = p_user_id
    and p.exact_home_score is not null
    and p.fixture_id <> p_fixture_id
    and case v_period
          when 'match'  then false
          when 'round'  then f2.round_id = v_round
          when 'month'  then r2.season_id = v_season
                         and date_trunc('month', f2.kickoff_at at time zone v_tz)
                           = date_trunc('month', v_kickoff at time zone v_tz)
          when 'season' then r2.season_id = v_season
          else f2.round_id = v_round
        end;

  return query select
    v_quota,
    v_period,
    v_used,
    case when v_quota is null then null::integer else greatest(v_quota - v_used, 0) end,
    v_eligible,
    v_eligible and (v_quota is null or v_used < v_quota);
end;
$$;

comment on function public.exact_score_state(uuid, uuid) is
  'État du quota de scores exacts d''un joueur sur un match. Réservé au serveur :
   savoir si un adversaire a déjà brûlé son score exact est une information de jeu.';

revoke all on function public.exact_score_state(uuid, uuid) from public;
revoke all on function public.rules_for_fixture(uuid) from public;

-- ---------------------------------------------------------------------------
-- 3. Le garde-fou d'écriture des pronostics
-- ---------------------------------------------------------------------------

create or replace function public.predictions_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locks_at timestamptz;
  v_allowed  boolean;
begin
  new.updated_at := now();

  -- Serveur de confiance : pas de session, donc pas de garde-fou. C'est lui
  -- qui pose les pronos par défaut à l'instant du verrouillage.
  if auth.uid() is null then
    return new;
  end if;

  if new.is_auto then
    raise exception 'Un prono par défaut ne peut être posé que par le serveur.'
      using errcode = '42501';
  end if;

  select locks_at into v_locks_at from fixtures where id = new.fixture_id;

  if v_locks_at is null then
    raise exception 'Match inconnu.' using errcode = '23503';
  end if;

  -- L'heure qui fait foi est celle du serveur, jamais celle du client.
  if now() >= v_locks_at then
    raise exception 'Match verrouillé : les pronostics sont fermés.'
      using errcode = '55000';
  end if;

  if new.exact_home_score is not null then
    select s.allowed into v_allowed
    from public.exact_score_state(new.user_id, new.fixture_id) s;

    if not coalesce(v_allowed, false) then
      raise exception 'Score exact indisponible sur ce match : quota épuisé ou match non autorisé.'
        using errcode = '55000';
    end if;
  end if;

  return new;
end;
$$;

create or replace trigger predictions_guard_trg
  before insert or update on predictions
  for each row execute function public.predictions_guard();

-- ---------------------------------------------------------------------------
-- 4. Trace de toute écriture sur un pronostic
-- ---------------------------------------------------------------------------
-- `prediction_audit` n'a aucune politique d'écriture : seul ce déclencheur,
-- exécuté avec les droits de son propriétaire, y écrit.

create or replace function public.predictions_write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb := null;
begin
  if tg_op = 'UPDATE' then
    v_before := to_jsonb(old) - 'created_at' - 'updated_at';
  end if;

  insert into prediction_audit (prediction_id, before, after, changed_by, reason)
  values (
    new.id,
    v_before,
    to_jsonb(new) - 'created_at' - 'updated_at',
    auth.uid(),
    case
      when tg_op = 'INSERT' and new.is_auto then 'prono par défaut'
      when tg_op = 'INSERT' then 'création'
      else 'modification'
    end
  );

  return null;
end;
$$;

create or replace trigger predictions_audit_trg
  after insert or update on predictions
  for each row execute function public.predictions_write_audit();

-- ---------------------------------------------------------------------------
-- 5. Participation à une journée — des compteurs, jamais du contenu
-- ---------------------------------------------------------------------------
-- « Marco n'a pas encore joué 2 matchs » doit pouvoir s'afficher sans qu'on
-- puisse déduire quoi que ce soit de ce que Marco a joué. RLS interdit de lire
-- les pronostics d'autrui avant verrouillage : cette fonction ne renvoie donc
-- que des nombres, et refuse de répondre à qui n'est pas membre du groupe.

create or replace function public.round_participation(p_round_id uuid)
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
  if not public.is_member() then
    raise exception 'Réservé aux membres du groupe.' using errcode = '42501';
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
  join (select distinct gm.user_id from group_members gm) m on m.user_id = p.id
  left join predictions pr
    on pr.user_id = p.id
   and pr.fixture_id in (select f.id from fixtures f where f.round_id = p_round_id)
  where p.is_active
  group by p.id, p.first_name, p.display_name, p.avatar_kind, p.avatar_value
  order by p.first_name;
end;
$$;

revoke all on function public.round_participation(uuid) from public;
grant execute on function public.round_participation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Index de confort
-- ---------------------------------------------------------------------------
-- La clé unique (user_id, fixture_id) couvre déjà « mes pronostics », mais le
-- calcul du quota balaye les pronostics d'un joueur sur toute une saison.

create index if not exists predictions_user_idx on predictions (user_id);
