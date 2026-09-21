-- Séparée de 0060 pour la même raison que 'poll' (0057) : une valeur
-- d'énumération fraîchement ajoutée ne peut pas être utilisée dans la
-- transaction qui la crée.
alter type message_type add value if not exists 'audio';
