-- ============================================================================
-- 0063 — Verrou anti-concurrence des synchronisations
-- ----------------------------------------------------------------------------
-- Audit technique, point 6 (P2). `sync_runs` est un journal, pas un verrou :
-- rien n'empêchait aujourd'hui deux exécutions concurrentes du même `kind`
-- (calendrier/live/classement) — improbable avec un seul Worker Cloudflare et
-- un admin qui clique rarement sur `/admin/synchronisation`, mais garanti de
-- finir par arriver dès plusieurs planificateurs ou plusieurs compétitions à
-- des cadences différentes. Deux runs concurrents du même kind peuvent
-- consommer deux fois le quota (gratuit et limité, 30-100 requêtes/jour
-- selon le fournisseur) pour rien, et écrire les mêmes lignes en parallèle.
--
-- Une seule ligne par `kind` : l'acquisition passe par `try_acquire_sync_lock`,
-- qui fait le test-et-pose dans la même transaction (`insert ... on conflict
-- ... where` est atomique côté PostgreSQL — impossible à obtenir de façon
-- fiable en lisant puis en écrivant séparément depuis Node, qui laisserait
-- une fenêtre de course entre les deux appels).
-- ============================================================================

create table if not exists sync_locks (
  kind       text primary key,      -- 'calendar' | 'live' | 'standings'
  locked_at  timestamptz not null default now(),
  locked_by  text                   -- libre : pid, identifiant de requête… pour le diagnostic
);

alter table sync_locks enable row level security;
alter table sync_locks force row level security;

-- Aucune policy cliente : seul le serveur (service_role, qui contourne RLS)
-- et les fonctions security definer ci-dessous y touchent — même politique
-- que `admin_actions`/`prediction_scores` (0003_rls.sql).

/**
 * Tente de prendre le verrou d'un `kind` de synchronisation.
 *
 * Renvoie `true` si le verrou est pris (aucun autre run en cours, ou le
 * précédent est plus vieux que `p_stale_after_minutes` — une synchronisation
 * qui a planté sans jamais relâcher son verrou ne doit pas bloquer toutes les
 * suivantes indéfiniment). Renvoie `false` si un autre run tient déjà le
 * verrou : l'appelant doit alors s'arrêter sans rien faire.
 */
create or replace function public.try_acquire_sync_lock(p_kind text, p_stale_after_minutes integer default 15)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  -- `INSERT ... ON CONFLICT DO UPDATE ... WHERE` est la brique atomique qui
  -- rend ceci sûr en concurrence : PostgreSQL ne compte la ligne dans
  -- `ROW_COUNT` que si l'UPDATE a réellement eu lieu (conflit ET condition
  -- vraie) — jamais sur un simple conflit dont la condition est fausse. Se
  -- fier à une comparaison d'horodatage après coup (deux appels dans la même
  -- seconde) donnerait un faux positif ; `ROW_COUNT` ne peut pas se tromper.
  insert into sync_locks (kind, locked_at)
  values (p_kind, now())
  on conflict (kind) do update
    set locked_at = now()
    where sync_locks.locked_at < now() - (p_stale_after_minutes || ' minutes')::interval;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

/** Relâche le verrou — en supprimant la ligne, pour que la prochaine acquisition soit immédiate. */
create or replace function public.release_sync_lock(p_kind text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from sync_locks where kind = p_kind;
$$;

revoke all on function public.try_acquire_sync_lock(text, integer) from public;
revoke all on function public.release_sync_lock(text) from public;
grant execute on function public.try_acquire_sync_lock(text, integer) to authenticated, service_role;
grant execute on function public.release_sync_lock(text) to authenticated, service_role;
