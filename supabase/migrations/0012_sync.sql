-- ============================================================================
-- LES P'TITS PRONOS D'HUGO — Synchronisation des données sportives (chantier C)
-- ----------------------------------------------------------------------------
-- Ce que cette migration installe :
--   1. Les références externes de la compétition (ESPN, API-Sports) : c'est la
--      seule source des identifiants de ligue. Aucun `270559` dans le code.
--   2. Les réglages de synchronisation, tous modifiables depuis l'admin.
--   3. De quoi journaliser proprement chaque exécution (`sync_runs.detail`).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Journal de synchronisation : le détail de ce qui s'est passé
-- ---------------------------------------------------------------------------

alter table sync_runs
  add column if not exists detail jsonb not null default '{}'::jsonb;

comment on column sync_runs.detail is
  'Ce que la synchronisation a fait ou n''a pas pu faire : horaires confirmés, '
  'équipes non rapprochées, tentatives par fournisseur. Sert au diagnostic. '
  'Les lignes portant detail->>''ledger'' = ''true'' forment le grand livre du '
  'quota : une par fournisseur réellement appelé.';

comment on column sync_runs.requests_used is
  'Requêtes HTTP consommées. Chez API-Sports (100/jour en gratuit), c''est ce '
  'compteur qui protège le quota. Seules les lignes du grand livre sont '
  'additionnées : la ligne récapitulative compte les mêmes requêtes, les '
  'compter deux fois amputerait le quota de moitié.';

-- Index du grand livre : « combien de requêtes API-Sports depuis 00:00 UTC ? »
create index if not exists sync_runs_ledger_idx
  on sync_runs (provider, started_at desc)
  where (detail->>'ledger') = 'true';

-- `status` accepte désormais 'partial' (synchro réussie mais incomplète) et
-- 'skipped' (hors fenêtre de match : rien à faire, rien consommé).
alter table sync_runs drop constraint if exists sync_runs_status_check;
alter table sync_runs
  add constraint sync_runs_status_check
  check (status in ('running', 'success', 'partial', 'skipped', 'failed'));

create index if not exists sync_runs_kind_started_idx on sync_runs (kind, started_at desc);
create index if not exists sync_runs_provider_started_idx on sync_runs (provider, started_at desc);

-- ---------------------------------------------------------------------------
-- 2. Références externes de la compétition
-- ---------------------------------------------------------------------------
-- ESPN : le Top 14 porte l'identifiant de ligue 270559 dans l'API interne
--        (site.api.espn.com/apis/site/v2/sports/rugby/270559/scoreboard).
-- API-Sports : la référence a la forme « ligue:saison ». L'identifiant de ligue
--        est à confirmer avec une vraie clé (endpoint /leagues?search=Top 14) :
--        il se corrige ici, en base, sans redéploiement.

insert into external_refs (provider, entity_type, entity_id, external_id, payload)
select 'espn', 'competition', c.id, '270559',
       jsonb_build_object(
         'endpoint', 'site.api.espn.com/apis/site/v2/sports/rugby/270559',
         'confirmed', false,
         'note', 'API interne non documentée : à revérifier avant la J1.'
       )
from competitions c
where c.code = 'top14'
on conflict (provider, entity_type, external_id) do nothing;

insert into external_refs (provider, entity_type, entity_id, external_id, payload)
select 'apisports', 'season', s.id, '16:2026',
       jsonb_build_object(
         'format', 'ligue:saison',
         'confirmed', false,
         'note', 'Identifiant de ligue à confirmer avec une clé réelle (/leagues?search=Top 14).'
       )
from seasons s
join competitions c on c.id = s.competition_id
where c.code = 'top14' and s.label = '2026/2027'
on conflict (provider, entity_type, external_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Réglages de synchronisation
-- ---------------------------------------------------------------------------
-- `sync.live_interval_minutes`, `sync.idle_interval_minutes` et
-- `sync.match_window_minutes` existent depuis 0004. On ajoute ici ce que le
-- chantier C a besoin de régler sans redéployer.

insert into app_settings (key, value) values
  -- Quota journalier de l'offre gratuite API-Sports (remise à zéro à 00:00 UTC).
  ('sync.apisports_daily_quota',      '100'::jsonb),
  -- Délai après le coup d'envoi au bout duquel un score terminé devient officiel.
  ('sync.official_after_minutes',     '180'::jsonb),
  -- Un horaire fixé à la main par l'admin n'est pas écrasé par la synchro.
  ('sync.respect_manual_overrides',   'true'::jsonb),
  -- Création automatique des journées manquantes (phase retour J14 à J26).
  ('sync.calendar_auto_create_rounds','true'::jsonb),
  -- Garde-fou : jamais plus de journées que n'en compte la saison régulière.
  ('sync.season_round_count',         '26'::jsonb),
  -- Alias de rapprochement des noms d'équipes : { "nom du fournisseur": "CODE" }.
  -- Vide au départ : le rapprochement par nom normalisé suffit dans la plupart
  -- des cas. On ne remplit ceci que pour les noms que la synchro n'a pas su
  -- reconnaître — ils sont listés dans sync_runs.detail.
  ('sync.team_aliases',               '{}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Lecture du journal par les membres
-- ---------------------------------------------------------------------------
-- `sync_runs` est déjà lisible par les membres (politique posée en 0003) : la
-- transparence sur « d'où vient ce score » fait partie du produit. L'écriture
-- reste réservée au serveur (clé service_role, qui contourne RLS).

comment on table sync_runs is
  'Journal des synchronisations. Lecture ouverte aux membres : c''est ce qui '
  'permet de répondre à « pourquoi le score n''a pas bougé ? ». Écriture '
  'réservée au serveur.';
