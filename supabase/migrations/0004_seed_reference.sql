-- ============================================================================
-- LES P'TITS PRONOS D'HUGO — Données de référence
-- ----------------------------------------------------------------------------
-- Ce ne sont PAS des données en dur : ce sont les valeurs de départ, toutes
-- modifiables depuis l'espace admin. Les équipes et le calendrier ne sont pas
-- ici : ils sont importés depuis le calendrier officiel LNR / l'API.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Sport, compétition, saison
-- ---------------------------------------------------------------------------

insert into sports (code, name, scoring_family, draw_possible)
values ('rugby', 'Rugby à XV', 'rugby_union', true)
on conflict (code) do nothing;

insert into competitions (sport_id, code, name, country)
select id, 'top14', 'Top 14', 'France' from sports where code = 'rugby'
on conflict (code) do nothing;

insert into seasons (competition_id, label, starts_on, ends_on, status)
select id, '2026/2027', date '2026-09-05', date '2027-06-26', 'active'
from competitions where code = 'top14'
on conflict (competition_id, label) do nothing;

-- ---------------------------------------------------------------------------
-- Barème par défaut (version 1)
-- ---------------------------------------------------------------------------

insert into scoring_rulesets (season_id, version, label, rules)
select s.id, 1, 'Barème de départ', jsonb_build_object(
  'points', jsonb_build_object(
    'wrong', 0,
    'winner', 1,
    'winner_and_margin', 3,
    'exact_score', 10
  ),
  'margin_mode', 'buckets',
  'margin_distance_tolerance', 3,
  'exact_score', jsonb_build_object(
    'quota', 1,
    'period', 'round',
    'imposed_fixture_ids', '[]'::jsonb
  ),
  'lock', jsonb_build_object('minutes_before_kickoff', 120),
  'default_prediction', jsonb_build_object(
    'enabled', true,
    'outcome', 'home',
    'margin_bucket', 'median'
  )
)
from seasons s
join competitions c on c.id = s.competition_id
where c.code = 'top14' and s.label = '2026/2027'
on conflict (season_id, version) do nothing;

-- Tranches d'écart par défaut
insert into margin_buckets (ruleset_id, position, min_points, max_points, label)
select r.id, v.position, v.min_points, v.max_points, v.label
from scoring_rulesets r
join seasons s on s.id = r.season_id
join competitions c on c.id = s.competition_id
cross join (values
  (1,  0,  5,   '0-5'),
  (2,  6,  10,  '6-10'),
  (3,  11, 15,  '11-15'),
  (4,  16, 20,  '16-20'),
  (5,  21, 25,  '21-25'),
  (6,  26, 30,  '26-30'),
  (7,  31, 35,  '31-35'),
  (8,  36, 40,  '36-40'),
  (9,  41, null,'41+')
) as v(position, min_points, max_points, label)
where c.code = 'top14' and s.label = '2026/2027' and r.version = 1
on conflict (ruleset_id, position) do nothing;

-- ---------------------------------------------------------------------------
-- Réglages applicatifs (tous modifiables depuis l'admin)
-- ---------------------------------------------------------------------------

insert into app_settings (key, value) values
  ('lock.minutes_before_kickoff', '120'::jsonb),
  ('lock.available_choices',      '[15,30,60,120,180,360,720,1440]'::jsonb),
  ('default_prediction.enabled',  'true'::jsonb),
  ('default_prediction.outcome',  '"home"'::jsonb),
  ('admin_log.public',            'true'::jsonb),
  ('feed.reactions',              '["😂","❤️","🔥","👀","🤡","🏆"]'::jsonb),
  ('colors.wrong',                '"#C0392B"'::jsonb),
  ('colors.winner',               '"#C79A2A"'::jsonb),
  ('colors.perfect',              '"#2E7D52"'::jsonb),
  ('sync.live_interval_minutes',  '5'::jsonb),
  ('sync.idle_interval_minutes',  '60'::jsonb),
  ('sync.match_window_minutes',   '135'::jsonb),
  ('notifications.quiet_from',    '"22:00"'::jsonb),
  ('notifications.quiet_to',      '"08:00"'::jsonb),
  ('notifications.reminder_hours_before_lock', '3'::jsonb),
  ('signup.require_email_confirmation', 'false'::jsonb),
  ('signup.invite_code_required', 'true'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Badges de départ
-- ---------------------------------------------------------------------------

insert into badges (code, name, emoji, description, rule, is_active) values
  ('machine',   'Machine à gagner', '🏆', '5 bons pronostics consécutifs',
   '{"type":"streak","kind":"good_prediction","threshold":5}'::jsonb, true),
  ('en_feu',    'En feu',           '🔥', '10 bons pronostics consécutifs',
   '{"type":"streak","kind":"good_prediction","threshold":10}'::jsonb, true),
  ('sniper',    'Sniper',           '🎯', '5 scores exacts sur la saison',
   '{"type":"count","kind":"exact_score","threshold":5}'::jsonb, true),
  ('spirale',   'Spirale négative', '💀', '5 mauvais pronostics consécutifs',
   '{"type":"streak","kind":"bad_prediction","threshold":5}'::jsonb, true),
  ('patron',    'Patron',           '👑', '5 journées terminées en tête',
   '{"type":"count","kind":"round_won","threshold":5}'::jsonb, true),
  ('remontada', 'Remontada',        '📈', 'La plus forte progression sur une journée',
   '{"type":"superlative","kind":"biggest_climb","scope":"round"}'::jsonb, true)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Pouvoirs (désactivés au départ, activés en vague 2)
-- ---------------------------------------------------------------------------

insert into powers (code, name, emoji, description, config, is_active) values
  ('joker', 'Joker', '🛡️',
   'Double les points obtenus sur un match de la journée.',
   '{"declare_before":"round_lock","resolves_at":"round_settled","multiplier":2}'::jsonb,
   false),
  ('duel', 'Duel', '⚔️',
   'Défie un joueur mieux classé : le gagnant de la journée empoche les points des deux.',
   '{"declare_before":"round_lock","resolves_at":"round_settled","target_rule":"better_ranked_only","tie":"no_transfer"}'::jsonb,
   false),
  ('spy', 'Espion', '🕵️',
   'Révèle le pronostic d''un joueur sur un seul match. La cible est prévenue.',
   '{"declare_before":"round_lock","reveals":1,"notify_target":true}'::jsonb,
   false),
  ('oracle', 'Oracle', '🔮',
   'Obtient un indice avant le verrouillage.',
   '{"declare_before":"round_lock"}'::jsonb,
   false),
  ('sabotage', 'Sabotage', '💣',
   'Pouvoir offensif visant un adversaire.',
   '{"declare_before":"round_lock","visible_to_target":true}'::jsonb,
   false)
on conflict (code) do nothing;
