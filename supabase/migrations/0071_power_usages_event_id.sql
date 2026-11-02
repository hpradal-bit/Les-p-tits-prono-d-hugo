-- Un joueur doit pouvoir annuler un super-pouvoir qu'il vient de déclarer,
-- tant que le premier match de la journée n'a pas commencé (demande de
-- l'hôte le 2 novembre : Hugo n'arrivait pas à retirer un Duel posé par
-- erreur contre Marc). Rien à craindre côté secret : avant ce même instant,
-- rien n'est encore notifié à la cible (`target_notified_at`, migration
-- 0067) ni révélé dans le Fil (`visibility.ts`) — annuler ici ne permet donc
-- jamais de « regarder puis se retirer » après coup.
--
-- `declarePower` écrit une ligne `events` (kind = 'power_declared') en même
-- temps que la ligne `power_usages`, mais sans lien explicite entre les
-- deux : annuler un usage ne pouvait donc pas retrouver de façon fiable
-- l'événement du Fil à retirer avec lui. Cette colonne porte ce lien.
alter table power_usages
  add column if not exists event_id uuid references events(id) on delete set null;

comment on column power_usages.event_id is
  'La ligne events (kind = power_declared) créée avec cet usage — permet à `cancelPowerUsage` de la retirer du Fil proprement. Null pour les usages déclarés avant cette migration.';
