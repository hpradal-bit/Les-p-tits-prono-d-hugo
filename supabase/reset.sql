-- ============================================================================
-- ⚠️  REMISE À ZÉRO COMPLÈTE DE LA BASE
-- ----------------------------------------------------------------------------
-- Ce fichier EFFACE TOUT : tables, joueurs, pronostics, points, historique.
--
-- À n'utiliser que dans un seul cas : la base est dans un état bancal après
-- une installation interrompue, et on veut repartir propre AVANT que les
-- joueurs aient commencé à jouer.
--
-- Une fois la saison lancée, ne JAMAIS exécuter ce fichier : il supprimerait
-- la saison entière. Pour mettre la base à jour, il suffit de relancer
-- apply-all.sql, qui sait être rejoué sans rien détruire.
--
-- Ne touche pas aux comptes de connexion (schéma auth) ni aux fichiers
-- (schéma storage) : uniquement les données de l'application.
-- ============================================================================

drop schema if exists public cascade;
create schema public;

-- Rétablissement des droits par défaut attendus par Supabase
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;

alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;
