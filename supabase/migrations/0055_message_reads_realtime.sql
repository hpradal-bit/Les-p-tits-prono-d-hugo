-- `message_reads` manquait à la publication temps réel : `messages` et
-- `message_reactions` y avaient été ajoutées (migration 0052), mais pas
-- `message_reads`. Conséquence concrète : les coches ✓✓ d'un message ne se
-- mettaient jamais à jour toutes seules quand un autre joueur le lisait — il
-- fallait recharger la page pour voir le changement. La politique de lecture
-- (`message_reads_read`) gouverne déjà qui reçoit quoi ; un abonné ne peut
-- jamais voir une ligne qu'il ne pourrait pas lire lui-même.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'message_reads'
    ) then
      execute 'alter publication supabase_realtime add table message_reads';
    end if;
  else
    raise notice 'Publication supabase_realtime absente : temps réel ignoré (base de vérification locale).';
  end if;
end $$;
