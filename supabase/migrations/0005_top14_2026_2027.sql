-- ============================================================================
-- LES P'TITS PRONOS D'HUGO — Top 14 2026/2027 : clubs et phase aller
-- ----------------------------------------------------------------------------
-- Source : calendrier officiel LNR (matchs aller, J1 à J13).
--
-- ⚠️ Les jours et horaires précis ne sont pas encore fixés par la LNR : les
-- matchs auront lieu le samedi ou le dimanche. On enregistre donc un coup
-- d'envoi provisoire (samedi 15 h), marqué kickoff_confirmed = false. La
-- synchronisation le remplacera par l'horaire réel dès qu'il sera publié, et
-- recalculera locks_at en conséquence.
-- ============================================================================

alter table fixtures
  add column if not exists kickoff_confirmed boolean not null default false;

comment on column fixtures.kickoff_confirmed is
  'false = horaire provisoire, à confirmer par la synchronisation ou par l''admin.';

-- --- Clubs ------------------------------------------------------------------

insert into teams (sport_id, code, name, short_name, city, primary_color, secondary_color, logo_url)
select s.id, v.code, v.name, v.short_name, v.city, v.c1, v.c2, v.logo
from sports s
cross join (values
  ('BAY', 'Aviron Bayonnais', 'Bayonne', 'Bayonne', '#005BAA', '#FFFFFF', '/logos/bayonne.png'),
  ('UBB', 'Union Bordeaux-Bègles', 'Bordeaux-Bègles', 'Bordeaux', '#8B1A3D', '#1A2A5B', '/logos/bordeaux.png'),
  ('CO', 'Castres Olympique', 'Castres', 'Castres', '#0091D2', '#FFFFFF', '/logos/castres.png'),
  ('ASM', 'ASM Clermont Auvergne', 'Clermont', 'Clermont-Ferrand', '#FFCD00', '#003C71', '/logos/clermont.png'),
  ('SR', 'Stade Rochelais', 'La Rochelle', 'La Rochelle', '#FFD100', '#000000', '/logos/la-rochelle.png'),
  ('LOU', 'LOU Rugby', 'Lyon', 'Lyon', '#E2001A', '#000000', '/logos/lyon.png'),
  ('MHR', 'Montpellier Hérault Rugby', 'Montpellier', 'Montpellier', '#0069B4', '#FFFFFF', '/logos/montpellier.png'),
  ('SP', 'Section Paloise', 'Pau', 'Pau', '#009640', '#FFFFFF', '/logos/pau.png'),
  ('USAP', 'USA Perpignan', 'Perpignan', 'Perpignan', '#C8102E', '#FFD100', '/logos/perpignan.png'),
  ('R92', 'Racing 92', 'Racing 92', 'Nanterre', '#009FE3', '#FFFFFF', '/logos/racing-92.png'),
  ('SFP', 'Stade Français Paris', 'Stade Français', 'Paris', '#E5007D', '#003DA5', '/logos/stade-francais.png'),
  ('RCT', 'RC Toulon', 'Toulon', 'Toulon', '#D6001C', '#000000', '/logos/toulon.png'),
  ('ST', 'Stade Toulousain', 'Toulouse', 'Toulouse', '#E30613', '#000000', '/logos/toulouse.png'),
  ('RCV', 'RC Vannes', 'Vannes', 'Vannes', '#1A1A1A', '#FFFFFF', '/logos/vannes.png')
) as v(code, name, short_name, city, c1, c2, logo)
where s.code = 'rugby'
on conflict (sport_id, code) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  city = excluded.city,
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  logo_url = excluded.logo_url;

-- --- Inscription des clubs dans la saison ------------------------------------
insert into season_teams (season_id, team_id)
select se.id, t.id
from seasons se
join competitions c on c.id = se.competition_id
join teams t on t.sport_id = c.sport_id
where c.code = 'top14' and se.label = '2026/2027'
on conflict do nothing;

-- --- Journées ----------------------------------------------------------------

insert into rounds (season_id, number, name, starts_at, ends_at, status)
select se.id, v.number, v.name,
       timezone('Europe/Paris', (v.saturday || ' 00:00')::timestamp),
       timezone('Europe/Paris', (v.saturday || ' 23:59')::timestamp) + interval '1 day',
       'upcoming'
from seasons se
join competitions c on c.id = se.competition_id
cross join (values
  (1, 'J1', '2026-09-05'),
  (2, 'J2', '2026-09-12'),
  (3, 'J3', '2026-09-19'),
  (4, 'J4', '2026-09-26'),
  (5, 'J5', '2026-10-03'),
  (6, 'J6', '2026-10-10'),
  (7, 'J7', '2026-10-24'),
  (8, 'J8', '2026-10-31'),
  (9, 'J9', '2026-11-07'),
  (10, 'J10', '2026-11-28'),
  (11, 'J11', '2026-12-05'),
  (12, 'J12', '2026-12-19'),
  (13, 'J13 · Boxing Day', '2026-12-26')
) as v(number, name, saturday)
where c.code = 'top14' and se.label = '2026/2027'
on conflict (season_id, number) do nothing;

-- --- Matchs (phase aller) -----------------------------------------------------

with cfg as (
  select coalesce((select (value #>> '{}')::int from app_settings
                   where key = 'lock.minutes_before_kickoff'), 120) as lock_minutes
)
insert into fixtures (round_id, home_team_id, away_team_id, kickoff_at, locks_at, status, kickoff_confirmed)
select r.id, h.id, a.id,
       timezone('Europe/Paris', (v.saturday || ' 15:00')::timestamp),
       timezone('Europe/Paris', (v.saturday || ' 15:00')::timestamp)
         - make_interval(mins => cfg.lock_minutes),
       'scheduled', false
from cfg
cross join (values
  (1, 'BAY', 'RCT', '2026-09-05'),
  (1, 'UBB', 'R92', '2026-09-05'),
  (1, 'CO', 'RCV', '2026-09-05'),
  (1, 'SR', 'ST', '2026-09-05'),
  (1, 'LOU', 'ASM', '2026-09-05'),
  (1, 'MHR', 'SP', '2026-09-05'),
  (1, 'SFP', 'USAP', '2026-09-05'),
  (2, 'ASM', 'SFP', '2026-09-12'),
  (2, 'SP', 'BAY', '2026-09-12'),
  (2, 'USAP', 'CO', '2026-09-12'),
  (2, 'R92', 'LOU', '2026-09-12'),
  (2, 'RCT', 'SR', '2026-09-12'),
  (2, 'ST', 'UBB', '2026-09-12'),
  (2, 'RCV', 'MHR', '2026-09-12'),
  (3, 'BAY', 'ASM', '2026-09-19'),
  (3, 'UBB', 'SFP', '2026-09-19'),
  (3, 'CO', 'RCT', '2026-09-19'),
  (3, 'SR', 'R92', '2026-09-19'),
  (3, 'LOU', 'SP', '2026-09-19'),
  (3, 'MHR', 'USAP', '2026-09-19'),
  (3, 'RCV', 'ST', '2026-09-19'),
  (4, 'ASM', 'CO', '2026-09-26'),
  (4, 'SFP', 'LOU', '2026-09-26'),
  (4, 'SP', 'SR', '2026-09-26'),
  (4, 'USAP', 'UBB', '2026-09-26'),
  (4, 'R92', 'BAY', '2026-09-26'),
  (4, 'RCT', 'RCV', '2026-09-26'),
  (4, 'ST', 'MHR', '2026-09-26'),
  (5, 'BAY', 'SFP', '2026-10-03'),
  (5, 'UBB', 'LOU', '2026-10-03'),
  (5, 'CO', 'ST', '2026-10-03'),
  (5, 'SR', 'ASM', '2026-10-03'),
  (5, 'MHR', 'RCT', '2026-10-03'),
  (5, 'R92', 'USAP', '2026-10-03'),
  (5, 'RCV', 'SP', '2026-10-03'),
  (6, 'ASM', 'UBB', '2026-10-10'),
  (6, 'LOU', 'SR', '2026-10-10'),
  (6, 'SFP', 'MHR', '2026-10-10'),
  (6, 'SP', 'CO', '2026-10-10'),
  (6, 'USAP', 'RCV', '2026-10-10'),
  (6, 'RCT', 'R92', '2026-10-10'),
  (6, 'ST', 'BAY', '2026-10-10'),
  (7, 'BAY', 'LOU', '2026-10-24'),
  (7, 'CO', 'SFP', '2026-10-24'),
  (7, 'SR', 'UBB', '2026-10-24'),
  (7, 'R92', 'MHR', '2026-10-24'),
  (7, 'RCT', 'SP', '2026-10-24'),
  (7, 'ST', 'USAP', '2026-10-24'),
  (7, 'RCV', 'ASM', '2026-10-24'),
  (8, 'UBB', 'BAY', '2026-10-31'),
  (8, 'ASM', 'R92', '2026-10-31'),
  (8, 'LOU', 'RCV', '2026-10-31'),
  (8, 'MHR', 'CO', '2026-10-31'),
  (8, 'SFP', 'SR', '2026-10-31'),
  (8, 'SP', 'ST', '2026-10-31'),
  (8, 'USAP', 'RCT', '2026-10-31'),
  (9, 'CO', 'R92', '2026-11-07'),
  (9, 'SR', 'BAY', '2026-11-07'),
  (9, 'MHR', 'LOU', '2026-11-07'),
  (9, 'SP', 'USAP', '2026-11-07'),
  (9, 'RCT', 'SFP', '2026-11-07'),
  (9, 'ST', 'ASM', '2026-11-07'),
  (9, 'RCV', 'UBB', '2026-11-07'),
  (10, 'BAY', 'CO', '2026-11-28'),
  (10, 'UBB', 'MHR', '2026-11-28'),
  (10, 'ASM', 'RCT', '2026-11-28'),
  (10, 'SR', 'USAP', '2026-11-28'),
  (10, 'LOU', 'ST', '2026-11-28'),
  (10, 'SFP', 'RCV', '2026-11-28'),
  (10, 'R92', 'SP', '2026-11-28'),
  (11, 'CO', 'LOU', '2026-12-05'),
  (11, 'MHR', 'SR', '2026-12-05'),
  (11, 'SP', 'SFP', '2026-12-05'),
  (11, 'USAP', 'ASM', '2026-12-05'),
  (11, 'RCT', 'UBB', '2026-12-05'),
  (11, 'ST', 'R92', '2026-12-05'),
  (11, 'RCV', 'BAY', '2026-12-05'),
  (12, 'BAY', 'USAP', '2026-12-19'),
  (12, 'UBB', 'SP', '2026-12-19'),
  (12, 'ASM', 'MHR', '2026-12-19'),
  (12, 'SR', 'CO', '2026-12-19'),
  (12, 'LOU', 'RCT', '2026-12-19'),
  (12, 'SFP', 'ST', '2026-12-19'),
  (12, 'R92', 'RCV', '2026-12-19'),
  (13, 'CO', 'UBB', '2026-12-26'),
  (13, 'MHR', 'BAY', '2026-12-26'),
  (13, 'SP', 'ASM', '2026-12-26'),
  (13, 'USAP', 'LOU', '2026-12-26'),
  (13, 'R92', 'SFP', '2026-12-26'),
  (13, 'ST', 'RCT', '2026-12-26'),
  (13, 'RCV', 'SR', '2026-12-26')
) as v(round_number, home_code, away_code, saturday)
join seasons se on se.label = '2026/2027'
join competitions c on c.id = se.competition_id and c.code = 'top14'
join rounds r on r.season_id = se.id and r.number = v.round_number
join teams h on h.code = v.home_code and h.sport_id = c.sport_id
join teams a on a.code = v.away_code and a.sport_id = c.sport_id
where not exists (
  select 1 from fixtures f
  where f.round_id = r.id and f.home_team_id = h.id and f.away_team_id = a.id
);
