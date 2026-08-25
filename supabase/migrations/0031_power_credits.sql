-- Coût en crédits des super-pouvoirs, et texte de présentation.
--
-- La carte d'un pouvoir suit la structure du composant Cascade du barème :
-- à gauche l'emoji, au centre le nom / la description / l'effet / les règles,
-- à droite le coût. Tout ce texte vit en base pour rester modifiable depuis
-- l'espace admin sans redéploiement.

-- Le coût par défaut, appliqué à un pouvoir qui n'en déclare pas.
insert into app_settings (key, value)
values ('powers.default_credit_cost', '3'::jsonb)
on conflict (key) do nothing;

-- Le nombre de crédits attribués à chaque joueur au démarrage d'une saison.
insert into app_settings (key, value)
values ('powers.credits_per_player', '10'::jsonb)
on conflict (key) do nothing;

-- Coût, effet et règles de chaque pouvoir existant.
update powers set
  description = 'Double les points marqués sur le match de ton choix.',
  config = config || jsonb_build_object(
    'credit_cost', 5,
    'effect', 'Tes points sur le match choisi sont multipliés par 2.',
    'rules', 'À déclarer avant le verrouillage de la journée. Sans point sur ce match, le pouvoir est perdu.'
  )
where code = 'joker';

update powers set
  description = 'Défie un joueur mieux classé : le gagnant rafle les points du perdant.',
  config = config || jsonb_build_object(
    'credit_cost', 8,
    'effect', 'Si tu marques plus que ta cible sur la journée, tu prends ses points. Sinon elle prend les tiens.',
    'rules', 'Uniquement contre un joueur mieux classé que toi. En cas d''égalité, aucun transfert.'
  )
where code = 'duel';

update powers set
  description = 'Consulte le pronostic d''un adversaire sur un match.',
  config = config || jsonb_build_object(
    'credit_cost', 3,
    'effect', 'Le pronostic de ta cible sur le match choisi t''est révélé.',
    'rules', 'La cible est prévenue qu''elle a été espionnée. Aucun point n''est gagné ni perdu.'
  )
where code = 'spy';

update powers set
  description = 'Bonus garanti sur le match de ton choix.',
  config = config || jsonb_build_object(
    'credit_cost', 4,
    'bonus', 2,
    'effect', 'Si tu marques au moins un point sur ce match, tu gagnes 2 points de plus.',
    'rules', 'À déclarer avant le verrouillage. Un match raté ne rapporte aucun bonus.'
  )
where code = 'oracle';

update powers set
  description = 'Retire des points à un adversaire sur un match.',
  config = config || jsonb_build_object(
    'credit_cost', 6,
    'max_penalty', 3,
    'effect', 'Ta cible perd jusqu''à 3 points sur le match choisi.',
    'rules', 'La cible est prévenue. Si elle ne marque rien sur ce match, le pouvoir est perdu.'
  )
where code = 'sabotage';
