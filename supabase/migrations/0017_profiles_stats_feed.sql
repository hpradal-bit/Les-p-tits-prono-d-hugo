-- ============================================================================
-- LES P'TITS PRONOS D'HUGO — Chantier H : profils, statistiques, Le Vestiaire
-- ----------------------------------------------------------------------------
-- Cette migration n'ajoute aucune table : le socle (0002) a déjà `events`,
-- `feed_posts`, `reactions`, `comments` et `streaks`. Elle se contente de :
--   1. garantir qu'un événement ne produit qu'une seule publication ;
--   2. accélérer les requêtes du fil et des statistiques ;
--   3. externaliser en base les derniers réglages du Vestiaire, pour qu'aucune
--      valeur métier (gabarit du résumé, tailles maximales…) ne reste en dur.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Projection des événements vers le fil
-- ---------------------------------------------------------------------------
-- Le Vestiaire est un lecteur de la table `events` : il ne recalcule jamais la
-- logique du jeu, il projette chaque événement en une publication. Cet index
-- rend la projection idempotente — la rejouer ne crée pas de doublon.

create unique index if not exists feed_posts_event_unique
  on feed_posts (group_id, event_id)
  where event_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Index de lecture
-- ---------------------------------------------------------------------------

create index if not exists reactions_post_idx    on reactions (post_id);
create index if not exists comments_post_idx     on comments (post_id, created_at);
create index if not exists events_round_idx      on events (round_id);
create index if not exists events_actor_idx      on events (actor_id);
create index if not exists predictions_user_idx  on predictions (user_id);
create index if not exists point_adjust_user_idx on point_adjustments (user_id, round_id);
create index if not exists streaks_user_idx      on streaks (user_id, season_id);

-- ---------------------------------------------------------------------------
-- 3. Réglages du Vestiaire et des statistiques
-- ---------------------------------------------------------------------------
-- Le gabarit du résumé de journée vit ici, pas dans le code : l'admin peut en
-- changer le ton sans redéploiement. Les phrases sont à trous ; une ligne dont
-- un trou ne peut pas être rempli est simplement omise. Aucun modèle de
-- langage n'intervient — la donnée d'abord, le style ensuite.

insert into app_settings (key, value) values
  ('feed.page_size',        '25'::jsonb),
  ('feed.post_max_length',  '500'::jsonb),
  ('feed.reply_max_length', '300'::jsonb),
  ('stats.podium_size',     '3'::jsonb),
  ('feed.round_summary_template',
   '[
      "🏉 JOURNÉE {n} TERMINÉE",
      "{leader} prend la première place avec {pts} points.",
      "{meilleur_joueur} signe la meilleure journée ({pts_j} pts).",
      "{plus_grosse_chute} chute de la {avant}e à la {apres}e place.",
      "🎯 {n_exacts} scores exacts · 🔥 {n_vainqueurs} bons vainqueurs",
      "📉 Le match le plus mal pronostiqué : {match} ({n_erreurs} joueurs dans l''erreur)"
    ]'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Séries (streaks)
-- ---------------------------------------------------------------------------
-- Rappel de contrat : `streaks` n'est écrite que par le serveur, à la clôture
-- d'une journée. Aucune politique d'écriture côté client n'existe (cf. 0003).

comment on table streaks is
  'Séries d''un joueur sur une saison. kind : good_prediction | bad_prediction | podium. Écrite uniquement par le serveur, à la clôture d''une journée.';
