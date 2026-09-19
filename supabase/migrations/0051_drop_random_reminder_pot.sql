-- Suppression du pot de messages aléatoires pour les rappels avant verrouillage.
--
-- Demande explicite d'Hugo : plus de tirage au hasard parmi une vingtaine de
-- titres/textes — une notification unique et fixe par créneau, comme le
-- système le fait déjà par défaut quand ce pot est vide. Le code qui le
-- lisait a été retiré (plus de lecture possible), cette migration retire la
-- donnée elle-même pour ne pas laisser un pot orphelin dans app_settings.
delete from app_settings where key = 'notifications.lock_reminder_messages';
