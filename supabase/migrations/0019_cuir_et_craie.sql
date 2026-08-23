-- ============================================================================
-- LES P'TITS PRONOS D'HUGO — Palette « Cuir & craie »
-- ----------------------------------------------------------------------------
-- Les couleurs du code de résultat sont modifiables depuis l'admin : les
-- valeurs semées en 0004 appartenaient à l'ancienne direction artistique.
-- On les aligne sur la maquette. `on conflict do nothing` n'aurait rien fait
-- ici, puisque les clés existent déjà : c'est bien une mise à jour.
-- ============================================================================

insert into app_settings (key, value) values
  ('colors.wrong',   '"#645c50"'::jsonb),   -- neutre : un raté n'accable personne
  ('colors.winner',  '"#56633f"'::jsonb),   -- sauge
  ('colors.perfect', '"#8c491a"'::jsonb),   -- terracotta
  ('theme.name',     '"Cuir & craie"'::jsonb),
  ('theme.brand',    '"#c67139"'::jsonb),
  ('theme.brand_2',  '"#7a8a5e"'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();
