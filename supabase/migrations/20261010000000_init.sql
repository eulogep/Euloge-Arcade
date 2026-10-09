-- ============================================================================
-- Euloge Arcade — initial schema
-- The database is the source of truth for the catalog. Every rule that matters
-- for security (roles, publication rules, embed allowlist, uploads) is enforced
-- here, not only in the client.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type public.launch_mode as enum ('hosted', 'embed', 'external');
create type public.game_status as enum ('draft', 'published', 'unpublished');
create type public.license_status as enum ('owned', 'open_source', 'embed_permitted', 'link_only', 'unverified');
create type public.link_status as enum ('unchecked', 'ok', 'broken', 'embed_blocked');

-- ----------------------------------------------------------------------------
-- Profiles & roles
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  display_name text check (char_length(display_name) between 1 and 40),
  avatar_url text check (avatar_url is null or (char_length(avatar_url) <= 1024 and avatar_url ~ '^https?://')),
  role text not null default 'player' check (role in ('player', 'admin')),
  recommendations_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Role check used by every admin policy. SECURITY DEFINER so it can read
-- profiles regardless of the caller's own RLS view.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'Joueur'), 40)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;

create policy "profiles: read own or admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Players may only change these columns; `role` is never writable from the API.
revoke update on public.profiles from authenticated, anon;
grant update (username, display_name, avatar_url, recommendations_consent) on public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- Embed allowlist (Mode B). Only these domains (and their subdomains) may be iframed.
-- ----------------------------------------------------------------------------
create table public.embed_domains (
  domain text primary key check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);

alter table public.embed_domains enable row level security;

create policy "embed_domains: public read" on public.embed_domains
  for select to anon, authenticated using (true);
create policy "embed_domains: admin insert" on public.embed_domains
  for insert to authenticated with check (public.is_admin());
create policy "embed_domains: admin update" on public.embed_domains
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "embed_domains: admin delete" on public.embed_domains
  for delete to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- Games catalog
-- ----------------------------------------------------------------------------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60),
  title text not null check (char_length(title) between 1 and 80),
  tagline text not null default '' check (char_length(tagline) <= 140),
  description text not null check (char_length(description) between 10 and 4000),
  instructions text not null default '' check (char_length(instructions) <= 4000),
  genre text[] not null default '{}' check (cardinality(genre) between 1 and 5),
  cover_url text check (char_length(cover_url) <= 2048),
  banner_url text check (char_length(banner_url) <= 2048),
  launch_mode public.launch_mode not null,
  launch_url text not null check (char_length(launch_url) <= 2048),
  source_url text check (char_length(source_url) <= 2048),
  developer text check (char_length(developer) <= 120),
  license_status public.license_status not null default 'unverified',
  license_notes text check (char_length(license_notes) <= 2000),
  compatibility jsonb not null default '{"keyboard":false,"mouse":false,"gamepad":false,"touch":false,"verified":false}'::jsonb,
  controls jsonb not null default '[]'::jsonb check (jsonb_typeof(controls) = 'array' and jsonb_array_length(controls) <= 30),
  orientation text not null default 'any' check (orientation in ('any', 'landscape', 'portrait')),
  featured boolean not null default false,
  featured_rank int check (featured_rank between 1 and 99),
  supports_scores boolean not null default false,
  status public.game_status not null default 'draft',
  published_at timestamptz,
  link_status public.link_status not null default 'unchecked',
  link_checked_at timestamptz,
  link_check_detail text check (char_length(link_check_detail) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null
);

create index games_status_published_idx on public.games (status, published_at desc);
create index games_genre_idx on public.games using gin (genre);

-- Server-side validation: mirrors src/lib/gameSchema.ts and cannot be bypassed.
create or replace function public.validate_game()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  host text;
  allowed_genres constant text[] := array['action','fps','platformer','arcade','puzzle','strategy','board','retro','racing','sports'];
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
    if new.license_status not in ('owned', 'open_source') then
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
    if new.license_status not in ('owned', 'open_source', 'embed_permitted') then
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

create trigger games_validate
  before insert or update on public.games
  for each row execute function public.validate_game();

alter table public.games enable row level security;

create policy "games: read published or admin" on public.games
  for select to anon, authenticated
  using (status = 'published' or public.is_admin());
create policy "games: admin insert" on public.games
  for insert to authenticated with check (public.is_admin());
create policy "games: admin update" on public.games
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "games: admin delete" on public.games
  for delete to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- Favorites
-- ----------------------------------------------------------------------------
create table public.favorites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

alter table public.favorites enable row level security;

create policy "favorites: own read" on public.favorites
  for select to authenticated using (user_id = (select auth.uid()));
create policy "favorites: own insert" on public.favorites
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "favorites: own delete" on public.favorites
  for delete to authenticated using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Play history (one row per launch). Popularity = distinct players, so a single
-- account launching repeatedly cannot inflate rankings.
-- ----------------------------------------------------------------------------
create table public.play_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index play_events_user_idx on public.play_events (user_id, created_at desc);
create index play_events_game_idx on public.play_events (game_id, created_at desc);

alter table public.play_events enable row level security;

create policy "play_events: own read" on public.play_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy "play_events: own insert on published games" on public.play_events
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.games g where g.id = game_id and g.status = 'published')
  );
create policy "play_events: own delete" on public.play_events
  for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.game_popularity(days int default 30)
returns table (game_id uuid, players bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select e.game_id, count(distinct e.user_id) as players
  from public.play_events e
  join public.games g on g.id = e.game_id and g.status = 'published'
  where e.created_at >= now() - make_interval(days => greatest(1, least(days, 365)))
  group by e.game_id;
$$;

-- ----------------------------------------------------------------------------
-- Scores (only for games that explicitly support them, e.g. first-party games)
-- Scores are submitted by the client: leaderboards are indicative, not anti-cheat.
-- ----------------------------------------------------------------------------
create table public.scores (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  score int not null check (score between 0 and 10000000),
  duration_seconds numeric(10, 2) check (duration_seconds is null or duration_seconds between 0 and 86400),
  meta jsonb not null default '{}'::jsonb check (pg_column_size(meta) <= 2048),
  created_at timestamptz not null default now()
);

create index scores_game_idx on public.scores (game_id, score desc);

alter table public.scores enable row level security;

create policy "scores: own read" on public.scores
  for select to authenticated using (user_id = (select auth.uid()));
create policy "scores: own insert on score-enabled games" on public.scores
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.games g
      where g.id = game_id and g.status = 'published' and g.supports_scores
    )
  );

-- Public leaderboard: best score per player, exposing only the display name.
create or replace function public.game_leaderboard(p_game_id uuid, p_limit int default 10)
returns table (rank bigint, display_name text, score int, achieved_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with best as (
    select distinct on (s.user_id) s.user_id, s.score, s.created_at
    from public.scores s
    where s.game_id = p_game_id
    order by s.user_id, s.score desc, s.created_at asc
  )
  select
    row_number() over (order by b.score desc, b.created_at asc) as rank,
    coalesce(p.display_name, 'Joueur') as display_name,
    b.score,
    b.created_at as achieved_at
  from best b
  left join public.profiles p on p.id = b.user_id
  order by b.score desc, b.created_at asc
  limit greatest(1, least(p_limit, 50));
$$;

-- ----------------------------------------------------------------------------
-- Achievements
-- ----------------------------------------------------------------------------
create table public.achievements (
  id text primary key check (id ~ '^[a-z0-9-]{2,60}$'),
  title text not null,
  description text not null,
  icon text not null default 'trophy',
  game_id uuid references public.games (id) on delete cascade,
  sort int not null default 0
);

alter table public.achievements enable row level security;

create policy "achievements: public read" on public.achievements
  for select to anon, authenticated using (true);
create policy "achievements: admin write" on public.achievements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.user_achievements (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  achievement_id text not null references public.achievements (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.user_achievements enable row level security;

create policy "user_achievements: own read" on public.user_achievements
  for select to authenticated using (user_id = (select auth.uid()));
create policy "user_achievements: own insert" on public.user_achievements
  for insert to authenticated with check (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Function privileges
-- ----------------------------------------------------------------------------
revoke execute on function public.game_popularity(int) from public;
revoke execute on function public.game_leaderboard(uuid, int) from public;
grant execute on function public.game_popularity(int) to anon, authenticated;
grant execute on function public.game_leaderboard(uuid, int) to anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Storage: cover images (admin) and avatars (owner). No SVG/HTML: images only.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('covers', 'covers', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/avif']),
  ('avatars', 'avatars', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "covers: admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'covers' and public.is_admin());
create policy "covers: admin update" on storage.objects
  for update to authenticated using (bucket_id = 'covers' and public.is_admin());
create policy "covers: admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'covers' and public.is_admin());

create policy "avatars: owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
