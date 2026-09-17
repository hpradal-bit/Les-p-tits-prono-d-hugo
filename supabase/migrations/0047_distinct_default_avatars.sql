-- Des avatars qu'on distingue enfin les uns des autres.
--
-- Tout le monde était resté sur le ballon par défaut : six joueurs, six
-- ballons identiques, impossible de reconnaître qui est qui dans un fil ou un
-- classement. On attribue donc une figure différente à chaque joueur qui n'a
-- jamais touché à la sienne — le thème reste le rugby et la buvette.
--
-- Seuls les profils encore sur le ballon sont touchés : un joueur ayant choisi
-- son emoji, sa photo ou son club garde ce qu'il a choisi.

with libres as (
  select id,
         row_number() over (order by created_at, id) as rang
  from profiles
  where avatar_kind = 'emoji'
    and coalesce(avatar_value, '') in ('', '🏉')
),
palette as (
  select * from unnest(array['🥇','🐐','🦁','🍺','⚡','🛡️','🎩','🐓','🦅','🧨','🎯','🏉'])
    with ordinality as p(emoji, rang)
)
update profiles
set avatar_value = palette.emoji
from libres
join palette on palette.rang = ((libres.rang - 1) % 12) + 1
where profiles.id = libres.id;
