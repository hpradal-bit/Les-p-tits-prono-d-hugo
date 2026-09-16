-- Rattrapage des matchs abandonnés par la fenêtre de synchronisation.
--
-- La synchro live n'interroge le fournisseur que sur les matchs du jour, et
-- seulement pendant `sync.match_window_minutes` après le coup d'envoi. Un match
-- dont le fournisseur n'a jamais annoncé la fin sort de cette fenêtre et n'est
-- plus jamais redemandé : il reste `live` avec le score figé sur la dernière
-- valeur reçue, parfois en pleine première mi-temps.
--
-- Ces deux réglages bornent la passe de rattrapage qui va le rechercher à sa
-- propre date.

-- Jusqu'où remonter. Au-delà, le fournisseur n'a plus la donnée en direct et
-- s'acharner ne ferait que consommer du quota.
insert into app_settings (key, value)
values ('sync.catchup_lookback_days', '14'::jsonb)
on conflict (key) do nothing;

-- Combien de dates interroger par passage. Une requête couvre tous les matchs
-- d'une même journée ; deux suffisent à rattraper un week-end sans vider le
-- quota d'un fournisseur limité à 100 requêtes par jour.
insert into app_settings (key, value)
values ('sync.catchup_max_dates_per_run', '2'::jsonb)
on conflict (key) do nothing;
