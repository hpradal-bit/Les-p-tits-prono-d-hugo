-- La notification poussée à la cible d'un pouvoir déclaré (Duel, Espion,
-- Sabotage — 0065) partait jusqu'ici immédiatement, à la déclaration : avant
-- le coup d'envoi, avant même que la journée soit verrouillée. Pour un
-- Sabotage ou un Duel, ça ouvre une fenêtre de riposte avant que l'auteur
-- n'ait couru lui-même le moindre risque (rapport de l'hôte : Hugo → Pierre,
-- puis Pierre → Hugo en retour, le même soir, bien avant que les autres
-- matchs de la journée ne se verrouillent). Pour l'Espion, c'est pire :
-- aucune notification ne doit jamais partir, le secret est tout l'intérêt du
-- pouvoir (cf. `src/lib/powers/kinds/spy.ts`, `journee/page.tsx`).
--
-- La notification part donc maintenant différée, balayée par le même cycle
-- cron que les rappels de verrouillage (`/api/push/dispatch`, cf.
-- `src/lib/push/power-sweep.ts`) : seulement une fois que TOUTE la journée
-- (`round_id`) est verrouillée, jamais avant, jamais pour l'Espion.
--
-- Cette colonne porte la marque d'envoi : `null` = pas encore envoyée,
-- balayée au prochain passage ; une date = déjà envoyée, jamais une seconde
-- fois (le balayage la réclame par un UPDATE ... WHERE target_notified_at IS
-- NULL avant d'envoyer quoi que ce soit, donc deux passages concurrents ne
-- peuvent pas doubler l'envoi).
alter table power_usages
  add column if not exists target_notified_at timestamptz;

comment on column power_usages.target_notified_at is
  'Date d''envoi de la notification poussée à la cible (Duel/Sabotage), une fois la journée entièrement verrouillée. Null = pas encore due ou pas envoyée. Toujours null pour l''Espion (jamais notifié).';
