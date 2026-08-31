-- ============================================================================
-- 0037 — Animation de début de semaine : mémoriser qui l'a déjà vue
-- ----------------------------------------------------------------------------
-- Demande d'Hugo : une célébration plein écran (classement de la journée)
-- doit s'afficher au plus une fois par joueur et par journée réglée — jamais
-- à chaque ouverture de l'application. Il faut donc un endroit où le retenir.
--
-- Clé (user_id, round_id, league_id) plutôt que (user_id, round_id) seul :
-- un joueur peut appartenir à plusieurs ligues sur la même compétition
-- (règle du projet, cf. migration 0033), et son classement — donc le
-- scénario de la célébration (1er, dernier, grosse progression…) — diffère
-- d'une ligue à l'autre pour la même journée.
-- ============================================================================

create table if not exists celebration_views (
  user_id    uuid not null references profiles(id) on delete cascade,
  round_id   uuid not null references rounds(id) on delete cascade,
  league_id  uuid not null references leagues(id) on delete cascade,
  seen_at    timestamptz not null default now(),
  primary key (user_id, round_id, league_id)
);

alter table celebration_views enable row level security;

-- Un joueur ne lit et n'écrit que ses propres marques — rien d'autre à
-- protéger ici, la table ne contient aucune donnée de jeu.
drop policy if exists celebration_views_own on celebration_views;
create policy celebration_views_own on celebration_views
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
