-- ============================================================================
-- Party games played together on one device: new "party" genre ("Entre amis")
-- and three first-party hosted games (Loups de Minuit, Chroma Clash, Micro Néon).
--
-- The rows mirror src/data/games.seed.json (same ids), so supabase/seed.sql,
-- which runs after migrations on a fresh database, skips them (on conflict).
-- ============================================================================

create or replace function public.validate_game()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  host text;
  allowed_genres constant text[] := array['action','fps','platformer','arcade','puzzle','strategy','board','retro','racing','sports','party'];
begin
  if not (new.genre <@ allowed_genres) then
    raise exception 'Genre inconnu dans %', new.genre using errcode = '22023';
  end if;

  if position('..' in new.launch_url) > 0 then
    raise exception 'launch_url invalide' using errcode = '22023';
  end if;

  if new.launch_mode = 'hosted' then
    if new.launch_url !~ '^/games/[a-z0-9-]+/[A-Za-z0-9._/-]*$' then
      raise exception 'Un jeu hébergé doit pointer vers /games/<slug>/…' using errcode = '22023';
    end if;
    if new.license_status not in ('owned', 'open_source', 'unverified') then
      raise exception 'Hébergement interdit sans droits (owned/open_source)' using errcode = '22023';
    end if;
  elsif new.launch_mode = 'embed' then
    if new.launch_url !~ '^https://' then
      raise exception 'Une intégration doit utiliser https://' using errcode = '22023';
    end if;
    host := lower(substring(new.launch_url from '^https://([^/:?#]+)'));
    if not exists (
      select 1 from public.embed_domains d
      where host = d.domain or right(host, char_length(d.domain) + 1) = '.' || d.domain
    ) then
      raise exception 'Domaine % absent de la liste des intégrations autorisées', host using errcode = '22023';
    end if;
    if new.license_status not in ('owned', 'open_source', 'embed_permitted', 'unverified') then
      raise exception 'Intégration interdite sans autorisation du fournisseur' using errcode = '22023';
    end if;
  else
    if new.launch_url !~ '^https://' then
      raise exception 'Un lien externe doit utiliser https://' using errcode = '22023';
    end if;
  end if;

  if new.cover_url is not null and new.cover_url !~ '^(https://|/[^/])' then
    raise exception 'cover_url invalide' using errcode = '22023';
  end if;
  if new.banner_url is not null and new.banner_url !~ '^(https://|/[^/])' then
    raise exception 'banner_url invalide' using errcode = '22023';
  end if;
  if new.source_url is not null and new.source_url !~ '^https://' then
    raise exception 'source_url doit utiliser https://' using errcode = '22023';
  end if;

  -- 'unverified' is accepted for drafts in every mode, but can never be published.
  if new.status = 'published' then
    if new.license_status = 'unverified' then
      raise exception 'Impossible de publier un jeu dont les droits ne sont pas vérifiés' using errcode = '22023';
    end if;
    if new.published_at is null then
      new.published_at := now();
    end if;
  end if;

  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  end if;
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;

insert into public.games (id, slug, title, tagline, description, instructions, genre, cover_url, banner_url, launch_mode, launch_url, source_url, developer, license_status, license_notes, compatibility, controls, orientation, featured, featured_rank, supports_scores, status, published_at, created_at) values
  ('6f1c2a10-0000-4000-8000-000000000040', 'loups-de-minuit', 'Loups de Minuit', 'Qui, parmi vous, est un loup-garou ? Débattez, votez, survivez.', 'Jeu de rôles et de bluff pour 4 à 16 joueurs réunis dans la même pièce, sur un seul téléphone ou une tablette. Chacun découvre son rôle en secret : loup-garou, voyante, protecteur ou simple villageois. La nuit, l''appareil fait le tour de la table et chacun agit en secret ; le jour, le village débat puis vote pour éliminer un suspect. Les loups gagnent s''ils deviennent aussi nombreux que le village, le village gagne s''il les démasque tous.', 'Asseyez-vous en cercle et passez l''appareil dans l''ordre affiché. Ne regardez l''écran que lorsque votre prénom s''affiche. La nuit, tout le monde agit, même les villageois (ils désignent un suspect sans effet), pour qu''aucun geste ne trahisse un rôle. Au matin, l''application annonce la victime ; le débat est chronométré, puis le village vote à main levée.', array['party', 'strategy']::text[], '/covers/loups-de-minuit.jpg', '/covers/loups-de-minuit-banner.jpg', 'hosted'::public.launch_mode, '/games/loups-de-minuit/index.html', null, 'Euloge', 'owned'::public.license_status, 'Jeu original d''Euloge Arcade, d''après le jeu de société traditionnel du loup-garou (aussi appelé « Mafia »). Rôles, textes et visuels originaux.', '{"keyboard":true,"mouse":true,"gamepad":false,"touch":true,"verified":true}'::jsonb, '[{"device":"touch","input":"Toucher","action":"Choisir un joueur, valider"},{"device":"mouse","input":"Clic","action":"Choisir un joueur, valider"},{"device":"keyboard","input":"Tab / Entrée","action":"Naviguer et valider"}]'::jsonb, 'any', false, null, false, 'published'::public.game_status, '2026-11-10T00:00:00Z', '2026-11-10T00:00:00Z'),
  ('6f1c2a10-0000-4000-8000-000000000041', 'chroma-clash', 'Chroma Clash', 'Couleurs, chiffres et coups bas : sois le premier à vider ta main.', 'Jeu de cartes original pour 2 à 8 joueurs, humains ou bots, sur un seul appareil. Pose une carte de la même couleur, du même chiffre ou du même symbole que celle du dessus. Bond, Retour, +2, Prisme et Surcharge +3 pimentent la partie ; enchaîne des combos de chiffres identiques et renvoie les pénalités en les cumulant. N''oublie pas d''annoncer « Dernière carte ! ».', 'Touche une ou plusieurs cartes pour les sélectionner, puis « Poser ». Sans carte jouable, pioche : si la carte piochée est jouable, tu peux la poser. Avant de poser ton avant-dernière carte, touche « Dernière carte ! », sinon tu pioches 2. Entre deux joueurs humains, l''appareil affiche un écran de passage pour garder les mains secrètes.', array['party', 'board']::text[], '/covers/chroma-clash.jpg', '/covers/chroma-clash-banner.jpg', 'hosted'::public.launch_mode, '/games/chroma-clash/index.html', null, 'Euloge', 'owned'::public.license_status, 'Jeu original d''Euloge Arcade de la famille des jeux de défausse (type « huit américain »). Paquet, règles, nom et visuels originaux ; sans lien avec aucun jeu de cartes commercial.', '{"keyboard":true,"mouse":true,"gamepad":false,"touch":true,"verified":true}'::jsonb, '[{"device":"touch","input":"Toucher une carte","action":"Sélectionner (plusieurs pour un combo)"},{"device":"mouse","input":"Clic","action":"Sélectionner, poser, piocher"},{"device":"keyboard","input":"Tab / Entrée","action":"Naviguer et valider"}]'::jsonb, 'any', false, null, false, 'published'::public.game_status, '2026-11-10T00:00:00Z', '2026-11-10T00:00:00Z'),
  ('6f1c2a10-0000-4000-8000-000000000042', 'micro-neon', 'Micro Néon', 'Le karaoké qui écoute ta voix et note ta justesse en direct.', 'Karaoké pour toute la soirée, de 1 à 12 chanteurs sur un seul appareil. Les paroles s''allument syllabe par syllabe pendant que les notes défilent ; le micro mesure ta justesse en direct, sur l''appareil, sans rien enregistrer. Chansons traditionnelles du domaine public, échauffement vocal, choix de la tonalité, classement de la soirée, et import de tes propres chansons (paroles .lrc + audio) en mode libre.', 'Active le micro et chante un « laaa » pour vérifier que ta voix est détectée. Choisis une chanson, écoute la mélodie si besoin, puis chante après le décompte : pendant la notation, seul le métronome joue. Aligne ta voix (points roses) sur les barres des notes. L''octave n''est pas pénalisée.', array['party', 'arcade']::text[], '/covers/micro-neon.jpg', '/covers/micro-neon-banner.jpg', 'hosted'::public.launch_mode, '/games/micro-neon/index.html', null, 'Euloge', 'owned'::public.license_status, 'Jeu original d''Euloge Arcade. Chansons intégrées : chansons traditionnelles françaises du domaine public (paroles et mélodies). Les chansons importées restent sur l''appareil du joueur.', '{"keyboard":true,"mouse":true,"gamepad":false,"touch":true,"verified":true}'::jsonb, '[{"device":"touch","input":"Toucher","action":"Choisir une chanson, lancer"},{"device":"mouse","input":"Clic","action":"Choisir une chanson, lancer"},{"device":"keyboard","input":"Tab / Entrée","action":"Naviguer et valider"}]'::jsonb, 'any', false, null, false, 'published'::public.game_status, '2026-11-10T00:00:00Z', '2026-11-10T00:00:00Z')
on conflict (id) do nothing;
