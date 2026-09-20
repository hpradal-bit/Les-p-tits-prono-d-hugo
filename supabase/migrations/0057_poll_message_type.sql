-- Séparée de 0058 : PostgreSQL refuse d'utiliser une valeur d'énumération
-- fraîchement ajoutée dans la même transaction qui l'a créée (« unsafe use
-- of new value »). Même précaution que pour 'halftime' (0053).
alter type message_type add value if not exists 'poll';
