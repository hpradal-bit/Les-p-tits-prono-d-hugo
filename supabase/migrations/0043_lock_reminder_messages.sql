-- ============================================================================
-- 0043 — Pot commun de messages aléatoires pour les rappels avant verrouillage
-- ----------------------------------------------------------------------------
-- Demande explicite d'Hugo : une vingtaine de titres/textes différents,
-- tirés au hasard à chaque envoi pour ne pas répéter toujours le même
-- message. Le premier est le sien, exactement tel qu'il l'a écrit.
-- ============================================================================

insert into app_settings (key, value)
values (
  'notifications.lock_reminder_messages',
  '[
    {"id":"msg_1","title":"DEEMAAAINN C''EST TOOOOOP 14 !!!!","body":"Allez mon coco, fonce si tu veux rafler la jourée de demain"},
    {"id":"msg_2","title":"🚨 ALERTE PRONOS 🚨","body":"Le TOP 14 n''attend pas les retardataires. Go go go !"},
    {"id":"msg_3","title":"On se réveille !! 🏉","body":"Tes potes ont peut-être déjà joué... toi, on t''attend encore."},
    {"id":"msg_4","title":"Ça sent le week-end de rugby 🍺🏉","body":"Pose tes pronos avant que le classement te passe devant."},
    {"id":"msg_5","title":"Dernière chance, champion 🏆","body":"Les pronos ferment bientôt, ne loupe pas ta place sur le podium !"},
    {"id":"msg_6","title":"Toulouse, Toulon, La Rochelle... et TOI ?","body":"Fais tes pronos avant que ça verrouille, feignasse 😏"},
    {"id":"msg_7","title":"🔥 C''est l''heure du grand oral 🔥","body":"Qui va gagner ce week-end ? À toi de trancher avant la fermeture."},
    {"id":"msg_8","title":"Psst... on a un scoop pour toi","body":"Le scoop, c''est que t''as pas encore fait tes pronos. Vite !"},
    {"id":"msg_9","title":"L''ovalie t''appelle 📣","body":"Réponds-lui avant qu''elle raccroche (et ferme les pronos)."},
    {"id":"msg_10","title":"Ton classement te regarde avec déception 😢","body":"Un petit prono et il te sourira à nouveau."},
    {"id":"msg_11","title":"Spoiler : tu n''as pas encore joué","body":"Corrige ça vite fait avant le coup d''envoi !"},
    {"id":"msg_12","title":"On ne va pas se mentir...","body":"Sans prono, pas de gloire. Alors go, fonce sur l''appli !"},
    {"id":"msg_13","title":"🏉 Round 2, FIGHT !","body":"Nouvelle journée, nouveaux pronos. Ne rate pas le coup d''envoi."},
    {"id":"msg_14","title":"T''as vu l''affiche du week-end ?","body":"Ça promet du spectacle — encore faut-il avoir misé dessus."},
    {"id":"msg_15","title":"Ding ding ding ⏰","body":"C''est l''heure des pronos, pas celle de la sieste !"},
    {"id":"msg_16","title":"Ton adversaire du classement a déjà joué...","body":"Toi non. Corrige ça avant qu''il ne prenne trop d''avance."},
    {"id":"msg_17","title":"Un peu de sérieux, s''il te plaît 🧐","body":"Le TOP 14 mérite tes pronos, pas ton silence radio."},
    {"id":"msg_18","title":"🎯 Score exact, ça te dit ?","body":"Tente ta chance avant la fermeture, qui ne tente rien n''a rien."},
    {"id":"msg_19","title":"SOS pronos manquants 🆘","body":"On a détecté une journée sans tes pronostics. Répare ça vite."},
    {"id":"msg_20","title":"Allez, un dernier effort 💪","body":"Deux minutes chrono pour poser tes pronos et rester dans la course."}
  ]'::jsonb
)
on conflict (key) do nothing;
