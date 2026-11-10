-- ============================================================================
-- Online party rooms (first game: Loups de Minuit).
--
-- Server-authoritative: the whole game state lives here and every move goes
-- through a SECURITY DEFINER function that checks the phase, the caller's role
-- and the target. Players have NO direct access to members, roles, night
-- actions or votes: each device reads its own view through party_state(), so a
-- player's role never reaches another device, not even the host's.
--
-- Realtime: every change bumps party_rooms.version; clients subscribe to that
-- row (RLS: members only) and re-read party_state().
-- Players are usually anonymous Supabase users (code + first name, no account).
-- ============================================================================

create table public.party_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  game text not null check (game in ('loups-de-minuit')),
  host_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'ended')),
  phase text not null default 'lobby' check (phase in ('lobby', 'night', 'day', 'vote', 'verdict', 'ended')),
  round int not null default 0,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 1024),
  phase_ends_at timestamptz,
  last_event jsonb not null default '{}'::jsonb,
  winner text check (winner in ('loups', 'village')),
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index party_rooms_host_idx on public.party_rooms (host_id);
create index party_rooms_updated_idx on public.party_rooms (updated_at);

create table public.party_members (
  room_id uuid not null references public.party_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  seat int not null,
  alive boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create unique index party_members_name_idx on public.party_members (room_id, lower(name));

create table public.party_secrets (
  room_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('loup', 'voyante', 'protecteur', 'villageois')),
  primary key (room_id, user_id),
  foreign key (room_id, user_id) references public.party_members (room_id, user_id) on delete cascade
);

create table public.party_night_actions (
  room_id uuid not null references public.party_rooms (id) on delete cascade,
  round int not null,
  user_id uuid not null,
  action text not null check (action in ('kill', 'inspect', 'protect')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (room_id, round, user_id)
);

create table public.party_votes (
  room_id uuid not null references public.party_rooms (id) on delete cascade,
  round int not null,
  user_id uuid not null,
  target_id uuid, -- null = abstention
  created_at timestamptz not null default now(),
  primary key (room_id, round, user_id)
);

alter table public.party_rooms enable row level security;
alter table public.party_members enable row level security;
alter table public.party_secrets enable row level security;
alter table public.party_night_actions enable row level security;
alter table public.party_votes enable row level security;

-- No direct access except reading the room row you belong to (needed by Realtime).
revoke all on public.party_members, public.party_secrets, public.party_night_actions, public.party_votes from anon, authenticated;
revoke insert, update, delete, truncate on public.party_rooms from anon, authenticated;
revoke all on public.party_rooms from anon;

create or replace function public.party_is_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.party_members m where m.room_id = p_room and m.user_id = (select auth.uid()));
$$;

create policy "party_rooms: members read" on public.party_rooms
  for select to authenticated using (public.party_is_member(id));

alter publication supabase_realtime add table public.party_rooms;

-- ----------------------------------------------------------------------------
-- Internal helpers (not callable through the API)
-- ----------------------------------------------------------------------------
create or replace function public.party_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v uuid := (select auth.uid());
begin
  if v is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  return v;
end;
$$;

create or replace function public.party_clean_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(v) < 1 or char_length(v) > 20 then
    raise exception 'Choisis un prénom de 1 à 20 caractères' using errcode = '22023';
  end if;
  return v;
end;
$$;

create or replace function public.party_new_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.party_rooms r where r.code = c);
  end loop;
  return c;
end;
$$;

create or replace function public.party_touch(p_room uuid)
returns void
language sql
volatile
set search_path = ''
as $$
  update public.party_rooms set version = version + 1, updated_at = now() where id = p_room;
$$;

/** Locks and returns the room, checking the caller is a member. */
create or replace function public.party_room_for_update(p_room uuid)
returns public.party_rooms
language plpgsql
volatile
set search_path = ''
as $$
declare
  r public.party_rooms;
begin
  select * into r from public.party_rooms where id = p_room for update;
  if not found or not exists (select 1 from public.party_members m where m.room_id = p_room and m.user_id = public.party_uid()) then
    raise exception 'Salon introuvable' using errcode = 'P0002';
  end if;
  return r;
end;
$$;

create or replace function public.party_role(p_room uuid, p_user uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select s.role from public.party_secrets s where s.room_id = p_room and s.user_id = p_user;
$$;

/** Ends the game if a side has won. Returns true when it did. */
create or replace function public.party_check_winner(p_room uuid)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  wolves int;
  others int;
  w text;
begin
  select count(*) filter (where s.role = 'loup'), count(*) filter (where s.role <> 'loup')
    into wolves, others
  from public.party_members m join public.party_secrets s using (room_id, user_id)
  where m.room_id = p_room and m.alive;
  if wolves = 0 then
    w := 'village';
  elsif wolves >= others then
    w := 'loups';
  else
    return false;
  end if;
  update public.party_rooms
    set status = 'ended', phase = 'ended', winner = w, phase_ends_at = null
  where id = p_room;
  return true;
end;
$$;

/** Resolves the night when every required action is in (or when forced by the host). */
create or replace function public.party_check_night(p_room uuid, p_force boolean default false)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  r public.party_rooms;
  missing int;
  target uuid;
  protected_id uuid;
  victim_name text;
  victim_role text;
  event jsonb;
begin
  select * into r from public.party_rooms where id = p_room;
  if r.phase <> 'night' then
    return;
  end if;
  select count(*) into missing
  from public.party_members m join public.party_secrets s using (room_id, user_id)
  where m.room_id = p_room and m.alive and s.role in ('loup', 'voyante', 'protecteur')
    and not exists (
      select 1 from public.party_night_actions a
      where a.room_id = p_room and a.round = r.round and a.user_id = m.user_id
    );
  if missing > 0 and not p_force then
    return;
  end if;

  -- Pack decision: most votes, ties to the earliest proposal.
  select a.target_id into target
  from public.party_night_actions a
  where a.room_id = p_room and a.round = r.round and a.action = 'kill'
  group by a.target_id
  order by count(*) desc, min(a.created_at) asc
  limit 1;
  select a.target_id into protected_id
  from public.party_night_actions a
  where a.room_id = p_room and a.round = r.round and a.action = 'protect';

  if target is null then
    event := jsonb_build_object('type', 'dawn', 'round', r.round, 'victim', null, 'saved', false);
  elsif target = protected_id then
    event := jsonb_build_object('type', 'dawn', 'round', r.round, 'victim', null, 'saved', true);
  else
    update public.party_members set alive = false where room_id = p_room and user_id = target
      returning name into victim_name;
    victim_role := public.party_role(p_room, target);
    event := jsonb_build_object(
      'type', 'dawn', 'round', r.round, 'victim', victim_name, 'saved', false,
      'victim_role', case when coalesce((r.settings ->> 'reveal_dead')::boolean, true) then victim_role end
    );
  end if;

  update public.party_rooms set last_event = event where id = p_room;
  if not public.party_check_winner(p_room) then
    update public.party_rooms
      set phase = 'day',
          phase_ends_at = now() + make_interval(secs => coalesce((r.settings ->> 'day_seconds')::int, 180))
    where id = p_room;
  end if;
end;
$$;

/** Resolves the village vote when every living player voted (or when forced). Ties: nobody. */
create or replace function public.party_check_vote(p_room uuid, p_force boolean default false)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  r public.party_rooms;
  missing int;
  top_target uuid;
  top_votes int;
  tied int;
  out_name text;
  out_role text;
  tally jsonb;
begin
  select * into r from public.party_rooms where id = p_room;
  if r.phase <> 'vote' then
    return;
  end if;
  select count(*) into missing
  from public.party_members m
  where m.room_id = p_room and m.alive
    and not exists (select 1 from public.party_votes v where v.room_id = p_room and v.round = r.round and v.user_id = m.user_id);
  if missing > 0 and not p_force then
    return;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', m.name, 'votes', t.n) order by t.n desc, m.seat), '[]'::jsonb)
    into tally
  from (
    select v.target_id, count(*)::int as n from public.party_votes v
    where v.room_id = p_room and v.round = r.round and v.target_id is not null
    group by v.target_id
  ) t join public.party_members m on m.room_id = p_room and m.user_id = t.target_id;

  select v.target_id, count(*) into top_target, top_votes
  from public.party_votes v
  where v.room_id = p_room and v.round = r.round and v.target_id is not null
  group by v.target_id order by count(*) desc limit 1;
  select count(*) into tied from (
    select v.target_id from public.party_votes v
    where v.room_id = p_room and v.round = r.round and v.target_id is not null
    group by v.target_id having count(*) = top_votes
  ) x;

  if top_target is not null and tied = 1 then
    update public.party_members set alive = false where room_id = p_room and user_id = top_target
      returning name into out_name;
    out_role := public.party_role(p_room, top_target);
  end if;
  update public.party_rooms
    set last_event = jsonb_build_object(
      'type', 'verdict', 'round', r.round, 'eliminated', out_name, 'tally', tally,
      'eliminated_role', case when out_name is not null and coalesce((r.settings ->> 'reveal_dead')::boolean, true) then out_role end
    )
  where id = p_room;
  if not public.party_check_winner(p_room) then
    update public.party_rooms set phase = 'verdict', phase_ends_at = now() + interval '8 seconds' where id = p_room;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- API
-- ----------------------------------------------------------------------------
create or replace function public.party_create_room(p_game text, p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.party_uid();
  v_name text := public.party_clean_name(p_name);
  r public.party_rooms;
begin
  -- Opportunistic cleanup of abandoned rooms.
  delete from public.party_rooms where updated_at < now() - interval '24 hours';
  if (select count(*) from public.party_rooms where host_id = uid and status <> 'ended') >= 3 then
    raise exception 'Tu animes déjà trois salons ouverts' using errcode = '22023';
  end if;
  insert into public.party_rooms (code, game, host_id) values (public.party_new_code(), p_game, uid) returning * into r;
  insert into public.party_members (room_id, user_id, name, seat) values (r.id, uid, v_name, 0);
  return jsonb_build_object('room_id', r.id, 'code', r.code);
end;
$$;

create or replace function public.party_join_room(p_code text, p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.party_uid();
  v_name text := public.party_clean_name(p_name);
  r public.party_rooms;
begin
  select * into r from public.party_rooms where code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'Aucun salon avec ce code' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.party_members where room_id = r.id and user_id = uid) then
    return jsonb_build_object('room_id', r.id, 'code', r.code);
  end if;
  if r.status <> 'lobby' then
    raise exception 'La partie a déjà commencé dans ce salon' using errcode = '22023';
  end if;
  if (select count(*) from public.party_members where room_id = r.id) >= 16 then
    raise exception 'Ce salon est complet (16 joueurs)' using errcode = '22023';
  end if;
  begin
    insert into public.party_members (room_id, user_id, name, seat)
    values (r.id, uid, v_name, (select coalesce(max(seat), -1) + 1 from public.party_members where room_id = r.id));
  exception when unique_violation then
    raise exception 'Le prénom « % » est déjà pris dans ce salon', v_name using errcode = '22023';
  end;
  perform public.party_touch(r.id);
  return jsonb_build_object('room_id', r.id, 'code', r.code);
end;
$$;

create or replace function public.party_leave_room(p_room uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.party_uid();
  r public.party_rooms := public.party_room_for_update(p_room);
  next_host uuid;
begin
  if r.status = 'playing' then
    -- Leaving mid-game counts as being eliminated; the game goes on.
    update public.party_members set alive = false where room_id = p_room and user_id = uid;
    if r.host_id = uid then
      -- Someone still playing keeps the power to unblock phases.
      select user_id into next_host from public.party_members
      where room_id = p_room and user_id <> uid order by alive desc, seat limit 1;
      update public.party_rooms set host_id = coalesce(next_host, uid) where id = p_room;
    end if;
    if not public.party_check_winner(p_room) then
      perform public.party_check_night(p_room);
      perform public.party_check_vote(p_room);
    end if;
  else
    delete from public.party_members where room_id = p_room and user_id = uid;
    select user_id into next_host from public.party_members where room_id = p_room order by seat limit 1;
    if next_host is null then
      delete from public.party_rooms where id = p_room;
      return;
    end if;
    if r.host_id = uid then
      update public.party_rooms set host_id = next_host where id = p_room;
    end if;
  end if;
  perform public.party_touch(p_room);
end;
$$;

create or replace function public.party_update_settings(p_room uuid, p_settings jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.party_rooms := public.party_room_for_update(p_room);
  s jsonb;
begin
  if r.host_id <> public.party_uid() or r.status = 'playing' then
    raise exception 'Seul l’hôte règle la partie, avant le début' using errcode = '42501';
  end if;
  s := jsonb_strip_nulls(jsonb_build_object(
    'loup', case when p_settings ? 'loup' then greatest(1, least(5, (p_settings ->> 'loup')::int)) end,
    'voyante', case when p_settings ? 'voyante' then greatest(0, least(1, (p_settings ->> 'voyante')::int)) end,
    'protecteur', case when p_settings ? 'protecteur' then greatest(0, least(1, (p_settings ->> 'protecteur')::int)) end,
    'day_seconds', case when p_settings ? 'day_seconds' then greatest(60, least(600, (p_settings ->> 'day_seconds')::int)) end,
    'reveal_dead', case when p_settings ? 'reveal_dead' then (p_settings ->> 'reveal_dead')::boolean end
  ));
  update public.party_rooms set settings = s where id = p_room;
  perform public.party_touch(p_room);
end;
$$;

create or replace function public.party_start(p_room uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.party_rooms := public.party_room_for_update(p_room);
  n int;
  l int;
  v int;
  p int;
begin
  if r.host_id <> public.party_uid() then
    raise exception 'Seul l’hôte peut lancer la partie' using errcode = '42501';
  end if;
  if r.status = 'playing' then
    raise exception 'La partie est déjà lancée' using errcode = '22023';
  end if;
  select count(*) into n from public.party_members where room_id = p_room;
  if n < 4 or n > 16 then
    raise exception 'Il faut entre 4 et 16 joueurs (actuellement %)', n using errcode = '22023';
  end if;
  l := coalesce((r.settings ->> 'loup')::int, greatest(1, round(n / 4.0)::int));
  v := coalesce((r.settings ->> 'voyante')::int, 1);
  p := coalesce((r.settings ->> 'protecteur')::int, case when n >= 6 then 1 else 0 end);
  if l * 2 >= n or l + v + p > n then
    raise exception 'Trop de rôles spéciaux pour % joueurs', n using errcode = '22023';
  end if;

  delete from public.party_secrets where room_id = p_room;
  delete from public.party_night_actions where room_id = p_room;
  delete from public.party_votes where room_id = p_room;
  update public.party_members set alive = true where room_id = p_room;
  insert into public.party_secrets (room_id, user_id, role)
  select p_room, x.user_id,
    case when x.rn <= l then 'loup' when x.rn <= l + v then 'voyante' when x.rn <= l + v + p then 'protecteur' else 'villageois' end
  from (select m.user_id, row_number() over (order by random()) as rn from public.party_members m where m.room_id = p_room) x;

  update public.party_rooms
    set status = 'playing', phase = 'night', round = 1, winner = null, phase_ends_at = null,
        last_event = jsonb_build_object('type', 'start', 'roles', jsonb_build_object('loup', l, 'voyante', v, 'protecteur', p, 'villageois', n - l - v - p))
  where id = p_room;
  perform public.party_touch(p_room);
end;
$$;

create or replace function public.party_night_action(p_room uuid, p_target uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.party_uid();
  r public.party_rooms := public.party_room_for_update(p_room);
  my_role text := public.party_role(p_room, uid);
  target_role text := public.party_role(p_room, p_target);
  result jsonb := '{}'::jsonb;
begin
  if r.phase <> 'night' then
    raise exception 'Ce n’est pas la nuit' using errcode = '22023';
  end if;
  if not exists (select 1 from public.party_members where room_id = p_room and user_id = uid and alive) then
    raise exception 'Les joueurs éliminés n’agissent plus' using errcode = '42501';
  end if;
  if not exists (select 1 from public.party_members where room_id = p_room and user_id = p_target and alive) then
    raise exception 'Cible invalide' using errcode = '22023';
  end if;

  if my_role = 'loup' then
    if target_role = 'loup' then
      raise exception 'Un loup ne peut pas attaquer la meute' using errcode = '22023';
    end if;
    -- Wolves may change their vote until the night ends.
    insert into public.party_night_actions (room_id, round, user_id, action, target_id)
    values (p_room, r.round, uid, 'kill', p_target)
    on conflict (room_id, round, user_id) do update set target_id = excluded.target_id, created_at = now();
  elsif my_role = 'voyante' then
    if p_target = uid then
      raise exception 'Choisis un autre joueur' using errcode = '22023';
    end if;
    insert into public.party_night_actions (room_id, round, user_id, action, target_id)
    values (p_room, r.round, uid, 'inspect', p_target)
    on conflict do nothing;
    if not found then
      raise exception 'Tu as déjà sondé quelqu’un cette nuit' using errcode = '22023';
    end if;
    result := jsonb_build_object('is_wolf', target_role = 'loup');
  elsif my_role = 'protecteur' then
    if exists (
      select 1 from public.party_night_actions a
      where a.room_id = p_room and a.round = r.round - 1 and a.user_id = uid and a.action = 'protect' and a.target_id = p_target
    ) then
      raise exception 'Pas deux nuits de suite la même personne' using errcode = '22023';
    end if;
    insert into public.party_night_actions (room_id, round, user_id, action, target_id)
    values (p_room, r.round, uid, 'protect', p_target)
    on conflict do nothing;
    if not found then
      raise exception 'Tu as déjà protégé quelqu’un cette nuit' using errcode = '22023';
    end if;
  else
    raise exception 'Tu dors cette nuit' using errcode = '22023';
  end if;

  perform public.party_check_night(p_room);
  perform public.party_touch(p_room);
  return result;
end;
$$;

create or replace function public.party_vote(p_room uuid, p_target uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.party_uid();
  r public.party_rooms := public.party_room_for_update(p_room);
begin
  if r.phase <> 'vote' then
    raise exception 'Le vote n’est pas ouvert' using errcode = '22023';
  end if;
  if not exists (select 1 from public.party_members where room_id = p_room and user_id = uid and alive) then
    raise exception 'Les joueurs éliminés ne votent plus' using errcode = '42501';
  end if;
  if p_target is not null and not exists (select 1 from public.party_members where room_id = p_room and user_id = p_target and alive) then
    raise exception 'Cible invalide' using errcode = '22023';
  end if;
  insert into public.party_votes (room_id, round, user_id, target_id) values (p_room, r.round, uid, p_target)
  on conflict (room_id, round, user_id) do update set target_id = excluded.target_id, created_at = now();
  perform public.party_check_vote(p_room);
  perform public.party_touch(p_room);
end;
$$;

/** Moves the game on: timers (anyone, once elapsed) or host overrides (any time). */
create or replace function public.party_advance(p_room uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.party_uid();
  r public.party_rooms := public.party_room_for_update(p_room);
  is_host boolean := r.host_id = uid;
  elapsed boolean := r.phase_ends_at is not null and now() >= r.phase_ends_at;
begin
  if r.phase = 'day' and (is_host or elapsed) then
    update public.party_rooms set phase = 'vote', phase_ends_at = null where id = p_room;
  elsif r.phase = 'verdict' and (is_host or elapsed) then
    update public.party_rooms set phase = 'night', round = round + 1, phase_ends_at = null where id = p_room;
  elsif r.phase = 'night' and is_host then
    perform public.party_check_night(p_room, true);
  elsif r.phase = 'vote' and is_host then
    perform public.party_check_vote(p_room, true);
  elsif r.phase = 'ended' and is_host then
    delete from public.party_secrets where room_id = p_room;
    delete from public.party_night_actions where room_id = p_room;
    delete from public.party_votes where room_id = p_room;
    update public.party_members set alive = true where room_id = p_room;
    update public.party_rooms
      set status = 'lobby', phase = 'lobby', round = 0, winner = null, phase_ends_at = null, last_event = '{}'::jsonb
    where id = p_room;
  else
    raise exception 'Pas encore : seul l’hôte peut accélérer' using errcode = '42501';
  end if;
  perform public.party_touch(p_room);
end;
$$;

/** The caller's view of the room: public state + only what this player may know. */
create or replace function public.party_state(p_room uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := public.party_uid();
  r public.party_rooms;
  my_role text;
  ended boolean;
  members jsonb;
  me jsonb;
begin
  select * into r from public.party_rooms where id = p_room;
  if not found or not public.party_is_member(p_room) then
    raise exception 'Salon introuvable' using errcode = 'P0002';
  end if;
  my_role := public.party_role(p_room, uid);
  ended := r.status = 'ended';

  select jsonb_agg(jsonb_build_object(
      'id', m.user_id,
      'name', m.name,
      'seat', m.seat,
      'alive', m.alive,
      'host', m.user_id = r.host_id,
      'me', m.user_id = uid,
      'role', case when ended or m.user_id = uid or (my_role = 'loup' and s.role = 'loup') then s.role end,
      'voted', case when r.phase = 'vote' then exists (
        select 1 from public.party_votes v where v.room_id = p_room and v.round = r.round and v.user_id = m.user_id) end
    ) order by m.seat)
    into members
  from public.party_members m
  left join public.party_secrets s on s.room_id = m.room_id and s.user_id = m.user_id
  where m.room_id = p_room;

  me := jsonb_build_object(
    'id', uid,
    'role', my_role,
    'action_target', (select a.target_id from public.party_night_actions a where a.room_id = p_room and a.round = r.round and a.user_id = uid),
    'vote_target', (select v.target_id from public.party_votes v where v.room_id = p_room and v.round = r.round and v.user_id = uid),
    'voted', exists (select 1 from public.party_votes v where v.room_id = p_room and v.round = r.round and v.user_id = uid),
    'last_protected', case when my_role = 'protecteur' then (
      select a.target_id from public.party_night_actions a
      where a.room_id = p_room and a.round = r.round - 1 and a.user_id = uid and a.action = 'protect') end,
    'inspections', case when my_role = 'voyante' then coalesce((
      select jsonb_agg(jsonb_build_object('round', a.round, 'target', a.target_id, 'is_wolf', public.party_role(p_room, a.target_id) = 'loup') order by a.round)
      from public.party_night_actions a where a.room_id = p_room and a.user_id = uid and a.action = 'inspect'), '[]'::jsonb) end,
    'pack_votes', case when my_role = 'loup' and r.phase = 'night' then coalesce((
      select jsonb_agg(jsonb_build_object('wolf', a.user_id, 'target', a.target_id))
      from public.party_night_actions a where a.room_id = p_room and a.round = r.round and a.action = 'kill'), '[]'::jsonb) end
  );

  return jsonb_build_object(
    'room', jsonb_build_object(
      'id', r.id, 'code', r.code, 'game', r.game, 'status', r.status, 'phase', r.phase, 'round', r.round,
      'settings', r.settings, 'phase_ends_at', r.phase_ends_at, 'last_event', r.last_event, 'winner', r.winner,
      'host_id', r.host_id, 'version', r.version, 'server_now', now()
    ),
    'members', coalesce(members, '[]'::jsonb),
    'me', me
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Privileges: helpers are internal; only the API is exposed, to signed-in users
-- (anonymous Supabase users included).
-- ----------------------------------------------------------------------------
revoke execute on function
  public.party_uid(), public.party_clean_name(text), public.party_new_code(), public.party_touch(uuid),
  public.party_room_for_update(uuid), public.party_role(uuid, uuid), public.party_check_winner(uuid),
  public.party_check_night(uuid, boolean), public.party_check_vote(uuid, boolean)
from public, anon, authenticated;

revoke execute on function
  public.party_is_member(uuid), public.party_create_room(text, text), public.party_join_room(text, text),
  public.party_leave_room(uuid), public.party_update_settings(uuid, jsonb), public.party_start(uuid),
  public.party_night_action(uuid, uuid), public.party_vote(uuid, uuid), public.party_advance(uuid), public.party_state(uuid)
from public, anon;

grant execute on function
  public.party_is_member(uuid), public.party_create_room(text, text), public.party_join_room(text, text),
  public.party_leave_room(uuid), public.party_update_settings(uuid, jsonb), public.party_start(uuid),
  public.party_night_action(uuid, uuid), public.party_vote(uuid, uuid), public.party_advance(uuid), public.party_state(uuid)
to authenticated;
