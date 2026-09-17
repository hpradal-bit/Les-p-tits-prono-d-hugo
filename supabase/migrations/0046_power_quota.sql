-- Des quotas par pouvoir, à la place des crédits.
--
-- Ancien système : une bourse de crédits commune, chaque pouvoir avait son
-- prix. Nouveau système : chaque pouvoir est utilisable un nombre fixe de fois
-- par joueur, et une fois épuisé il ne revient pas. Plus lisible à l'usage —
-- « il me reste deux Espions » se retient mieux qu'un solde de crédits — et
-- ça force à choisir son moment.

-- Le plafond par défaut, pour un pouvoir qui ne déclare pas le sien.
insert into app_settings (key, value)
values ('powers.max_uses_per_player', '3'::jsonb)
on conflict (key) do nothing;

-- Un pouvoir n'est plus adossé à un jeton : le quota se compte sur les
-- utilisations elles-mêmes. Les lignes existantes gardent leur jeton, ce qui
-- préserve l'historique des saisons déjà jouées.
alter table power_usages alter column token_id drop not null;

comment on column power_usages.token_id is
  'Hérité du système de crédits (avant septembre 2026). Nul depuis le passage aux quotas par pouvoir : c''est le nombre d''utilisations qui fait foi.';
