-- ============================================================================
-- Chroma Clash Online — Server-Authoritative Rooms & Secret Hands
--
-- Fixes the client-side state broadcast vulnerability:
-- 1. All hands (`seats[*].hand`) and the draw pile (`draw`) live exclusively in
--    `public.chroma_secrets`, with RLS enabled and ALL privileges revoked from
--    `anon` and `authenticated`.
-- 2. Every game action (`chroma_start`, `chroma_play`, `chroma_draw`,
--    `chroma_pass`, `chroma_announce`, `chroma_counter_uno`, `chroma_bot_step`)
--    is executed on the PostgreSQL server inside `SECURITY DEFINER` RPCs that
--    verify `auth.uid()`, turn order, and card legality against hidden hands.
-- 3. Clients read their view via `public.chroma_state(p_room)` which returns
--    ONLY the caller's own `my_hand`, `draw_count`, `top_card`, and each seat's
--    `hand_count`.
-- 4. Room updates are signaled over `public.party_rooms` (`postgres_changes`),
--    which is protected by the `party_is_member(id)` RLS policy.
-- ============================================================================

-- Allow 'chroma-clash' in party_rooms.game and 'playing' in party_rooms.phase
alter table public.party_rooms drop constraint if exists party_rooms_game_check;
alter table public.party_rooms
  add constraint party_rooms_game_check check (game in ('loups-de-minuit', 'chroma-clash'));

alter table public.party_rooms drop constraint if exists party_rooms_phase_check;
alter table public.party_rooms
  add constraint party_rooms_phase_check check (phase in ('lobby', 'playing', 'night', 'day', 'vote', 'verdict', 'ended'));

-- Secret table: hands & draw pile are NEVER readable by clients
create table if not exists public.chroma_secrets (
  room_id uuid primary key references public.party_rooms (id) on delete cascade,
  seats jsonb not null default '[]'::jsonb,
  draw jsonb not null default '[]'::jsonb,
  discard jsonb not null default '[]'::jsonb,
  current_seat int not null default 0,
  direction int not null default 1 check (direction in (-1, 1)),
  active_color text not null default 'cyan' check (active_color in ('cyan', 'rose', 'ambre', 'vert')),
  pending_draw int not null default 0,
  drawn_card_id int,
  announced boolean not null default false,
  vulnerable_seat int,
  winner_seat int,
  round_points int not null default 0,
  last_message text not null default ''
);

alter table public.chroma_secrets enable row level security;
revoke all on public.chroma_secrets from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Update generic room lifecycle RPCs to handle 'chroma-clash' defaults & leave
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
  v_settings jsonb;
  r public.party_rooms;
begin
  delete from public.party_rooms where updated_at < now() - interval '24 hours';
  if (select count(*) from public.party_rooms where host_id = uid and status <> 'ended') >= 3 then
    raise exception 'Tu animes déjà trois salons ouverts' using errcode = '22023';
  end if;
  if p_game = 'chroma-clash' then
    v_settings := '{"bots": 1, "combos": true, "stacking": true, "sevenZero": true}'::jsonb;
  else
    v_settings := '{"day_seconds": 180, "reveal_dead": true}'::jsonb;
  end if;
  insert into public.party_rooms (code, game, host_id, settings)
    values (public.party_new_code(), p_game, uid, v_settings)
    returning * into r;
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
  max_players int;
  cur_players int;
  cur_bots int;
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
  max_players := case when r.game = 'chroma-clash' then 8 else 16 end;
  select count(*) into cur_players from public.party_members where room_id = r.id;
  if cur_players >= max_players then
    raise exception 'Ce salon est complet (% joueurs)', max_players using errcode = '22023';
  end if;
  begin
    insert into public.party_members (room_id, user_id, name, seat)
    values (r.id, uid, v_name, (select coalesce(max(seat), -1) + 1 from public.party_members where room_id = r.id));
  exception when unique_violation then
    raise exception 'Le prénom « % » est déjà pris dans ce salon', v_name using errcode = '22023';
  end;
  if r.game = 'chroma-clash' then
    cur_bots := coalesce((r.settings ->> 'bots')::int, 1);
    if cur_players + 1 + cur_bots > 8 then
      update public.party_rooms
        set settings = jsonb_set(r.settings, '{bots}', to_jsonb(greatest(0, 8 - (cur_players + 1))))
      where id = r.id;
    end if;
  end if;
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
  s public.chroma_secrets;
  new_seats jsonb := '[]'::jsonb;
  seat_el jsonb;
  i int;
begin
  if r.game = 'chroma-clash' then
    if r.status = 'playing' then
      -- Convert departing human player's seat into a bot so the match continues seamlessly
      select * into s from public.chroma_secrets where room_id = p_room for update;
      if found then
        for i in 0 .. jsonb_array_length(s.seats) - 1 loop
          seat_el := s.seats -> i;
          if (seat_el ->> 'user_id') = uid::text then
            seat_el := jsonb_set(jsonb_set(seat_el, '{bot}', 'true'::jsonb), '{user_id}', 'null'::jsonb);
          end if;
          new_seats := new_seats || jsonb_build_array(seat_el);
        end loop;
        update public.chroma_secrets set seats = new_seats where room_id = p_room;
      end if;
      delete from public.party_members where room_id = p_room and user_id = uid;
      select user_id into next_host from public.party_members where room_id = p_room order by seat limit 1;
      if next_host is null then
        delete from public.party_rooms where id = p_room;
        return;
      end if;
      if r.host_id = uid then
        update public.party_rooms set host_id = next_host where id = p_room;
      end if;
      perform public.party_touch(p_room);
      return;
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
      perform public.party_touch(p_room);
      return;
    end if;
  end if;

  -- Default behavior for Loups de Minuit
  if r.status = 'playing' then
    update public.party_members set alive = false where room_id = p_room and user_id = uid;
    if r.host_id = uid then
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

-- ----------------------------------------------------------------------------
-- Internal Helpers for Chroma Clash (not callable via API)
-- ----------------------------------------------------------------------------
create or replace function public.chroma_color_label(p_color text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_color
    when 'cyan' then 'Cyan'
    when 'rose' then 'Rose'
    when 'ambre' then 'Ambre'
    when 'vert' then 'Vert'
    else coalesce(p_color, '')
  end;
$$;

create or replace function public.chroma_card_label(p_card jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case (p_card ->> 'kind')
    when 'num' then (p_card ->> 'value') || ' ' || public.chroma_color_label(p_card ->> 'color')
    when 'bond' then 'Bond ' || public.chroma_color_label(p_card ->> 'color')
    when 'retour' then 'Retour ' || public.chroma_color_label(p_card ->> 'color')
    when 'plus2' then '+2 ' || public.chroma_color_label(p_card ->> 'color')
    when 'prisme' then 'Prisme'
    when 'surcharge' then 'Surcharge +3'
    else 'Carte'
  end;
$$;

create or replace function public.chroma_hand_points(p_hand jsonb)
returns int
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum(
    case (c ->> 'kind')
      when 'num' then coalesce((c ->> 'value')::int, 0)
      when 'bond' then 20
      when 'retour' then 20
      when 'plus2' then 20
      when 'prisme' then 50
      when 'surcharge' then 50
      else 0
    end
  )::int, 0)
  from jsonb_array_elements(coalesce(p_hand, '[]'::jsonb)) as c;
$$;

create or replace function public.chroma_can_play(
  p_card jsonb,
  p_top jsonb,
  p_active_color text,
  p_pending_draw int,
  p_drawn_card_id int,
  p_stacking boolean
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_kind text := p_card ->> 'kind';
  v_color text := p_card ->> 'color';
  v_val int := (p_card ->> 'value')::int;
  v_id int := (p_card ->> 'id')::int;
begin
  if p_drawn_card_id is not null and v_id <> p_drawn_card_id then
    return false;
  end if;
  if p_pending_draw > 0 then
    return coalesce(p_stacking, true) and v_kind in ('plus2', 'surcharge');
  end if;
  if v_kind in ('prisme', 'surcharge') then
    return true;
  end if;
  if v_color = p_active_color then
    return true;
  end if;
  if v_kind = 'num' then
    return (p_top ->> 'kind') = 'num' and (p_top ->> 'value')::int = v_val;
  end if;
  return v_kind = (p_top ->> 'kind');
end;
$$;

/** Draws up to p_count cards for p_seat in room p_room. Returns array of drawn cards. */
create or replace function public.chroma_draw_cards(p_room uuid, p_seat int, p_count int)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  s public.chroma_secrets;
  v_draw jsonb;
  v_discard jsonb;
  v_top jsonb;
  v_card jsonb;
  v_drawn jsonb := '[]'::jsonb;
  v_hand jsonb;
  v_seat_obj jsonb;
  i int;
begin
  select * into s from public.chroma_secrets where room_id = p_room for update;
  v_draw := s.draw;
  v_discard := s.discard;

  for i in 1 .. p_count loop
    if jsonb_array_length(v_draw) = 0 and jsonb_array_length(v_discard) > 1 then
      v_top := v_discard -> (jsonb_array_length(v_discard) - 1);
      select coalesce(jsonb_agg(elem order by random()), '[]'::jsonb)
        into v_draw
      from jsonb_array_elements(v_discard - (jsonb_array_length(v_discard) - 1)) as elem;
      v_discard := jsonb_build_array(v_top);
    end if;
    exit when jsonb_array_length(v_draw) = 0;

    v_card := v_draw -> (jsonb_array_length(v_draw) - 1);
    v_draw := v_draw - (jsonb_array_length(v_draw) - 1);
    v_drawn := v_drawn || jsonb_build_array(v_card);
  end loop;

  v_seat_obj := s.seats -> p_seat;
  v_hand := (v_seat_obj -> 'hand') || v_drawn;
  v_seat_obj := jsonb_set(v_seat_obj, '{hand}', v_hand);

  update public.chroma_secrets
    set draw = v_draw,
        discard = v_discard,
        seats = jsonb_set(s.seats, array[p_seat::text], v_seat_obj)
  where room_id = p_room;

  return v_drawn;
end;
$$;

/** Internal play execution shared by human turns and bot turns. */
create or replace function public.chroma_apply_play(
  p_room uuid,
  p_card_ids int[],
  p_color text,
  p_swap_target int,
  p_keep_vulnerable boolean
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  r public.party_rooms;
  s public.chroma_secrets;
  v_combos boolean;
  v_stacking boolean;
  v_seven_zero boolean;
  v_me int;
  v_n int;
  v_seat jsonb;
  v_hand jsonb;
  v_top jsonb;
  v_played jsonb := '[]'::jsonb;
  v_remaining jsonb := '[]'::jsonb;
  v_first jsonb;
  v_last jsonb;
  v_card jsonb;
  v_cid int;
  v_active_color text;
  v_name text;
  v_what text;
  v_event text;
  v_steps int := 1;
  v_dir int;
  v_pending int;
  v_vulnerable int := null;
  v_seats jsonb;
  v_target int;
  v_best_count int;
  v_cnt int;
  v_my_hand jsonb;
  v_target_hand jsonb;
  v_rotated jsonb;
  v_from_idx int;
  v_next_idx int;
  v_pts int := 0;
  v_score int;
  i int;
begin
  select * into r from public.party_rooms where id = p_room;
  select * into s from public.chroma_secrets where room_id = p_room for update;

  if s.winner_seat is not null then
    raise exception 'La manche est déjà terminée' using errcode = '22023';
  end if;
  if p_card_ids is null or coalesce(array_length(p_card_ids, 1), 0) = 0 then
    raise exception 'Sélectionne au moins une carte' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_card_ids) as x) <> array_length(p_card_ids, 1) then
    raise exception 'Sélection invalide (doublon)' using errcode = '22023';
  end if;

  v_combos := coalesce((r.settings ->> 'combos')::boolean, true);
  v_stacking := coalesce((r.settings ->> 'stacking')::boolean, true);
  v_seven_zero := coalesce((r.settings ->> 'sevenZero')::boolean, true);

  v_me := s.current_seat;
  v_n := jsonb_array_length(s.seats);
  v_seat := s.seats -> v_me;
  v_hand := v_seat -> 'hand';
  v_top := s.discard -> (jsonb_array_length(s.discard) - 1);

  -- Resolve played cards in exact order
  foreach v_cid in array p_card_ids loop
    select elem into v_card
    from jsonb_array_elements(v_hand) as elem
    where (elem ->> 'id')::int = v_cid
    limit 1;
    if v_card is null then
      raise exception 'Cette carte n’est pas dans ta main' using errcode = '22023';
    end if;
    v_played := v_played || jsonb_build_array(v_card);
  end loop;

  v_first := v_played -> 0;
  v_last := v_played -> (jsonb_array_length(v_played) - 1);

  if not public.chroma_can_play(v_first, v_top, s.active_color, s.pending_draw, s.drawn_card_id, v_stacking) then
    raise exception 'Cette carte ne peut pas être posée sur la défausse actuelle' using errcode = '22023';
  end if;

  if jsonb_array_length(v_played) > 1 then
    if not v_combos or s.drawn_card_id is not null or (v_first ->> 'kind') <> 'num' then
      raise exception 'Les combos ne sont possibles qu’avec des cartes numériques de même valeur' using errcode = '22023';
    end if;
    for i in 1 .. jsonb_array_length(v_played) - 1 loop
      v_card := v_played -> i;
      if (v_card ->> 'kind') <> 'num' or (v_card ->> 'value')::int <> (v_first ->> 'value')::int then
        raise exception 'Toutes les cartes d’un combo doivent avoir le même chiffre' using errcode = '22023';
      end if;
    end loop;
  end if;

  if (v_last ->> 'kind') in ('prisme', 'surcharge') then
    if p_color is null or p_color not in ('cyan', 'rose', 'ambre', 'vert') then
      raise exception 'Choisis une couleur valide (cyan, rose, ambre, vert)' using errcode = '22023';
    end if;
    v_active_color := p_color;
  else
    v_active_color := v_last ->> 'color';
  end if;

  -- Build remaining hand
  select coalesce(jsonb_agg(elem), '[]'::jsonb)
    into v_remaining
  from jsonb_array_elements(v_hand) as elem
  where not ((elem ->> 'id')::int = any(p_card_ids));

  v_seats := jsonb_set(s.seats, array[v_me::text, 'hand'], v_remaining);
  v_name := v_seat ->> 'name';
  v_what := case
    when jsonb_array_length(v_played) > 1 then jsonb_array_length(v_played)::text || ' × ' || (v_last ->> 'value')
    else public.chroma_card_label(v_last)
  end;
  v_event := v_name || ' joue ' || v_what || case
    when (v_last ->> 'kind') in ('prisme', 'surcharge') then ' et choisit ' || public.chroma_color_label(v_active_color)
    else ''
  end || '.';

  -- Check immediate victory
  if jsonb_array_length(v_remaining) = 0 then
    for i in 0 .. v_n - 1 loop
      if i <> v_me then
        v_pts := v_pts + public.chroma_hand_points(v_seats -> i -> 'hand');
      end if;
    end loop;
    v_score := coalesce((v_seats -> v_me ->> 'score')::int, 0) + v_pts;
    v_seats := jsonb_set(v_seats, array[v_me::text, 'score'], to_jsonb(v_score));

    update public.chroma_secrets
      set seats = v_seats,
          discard = s.discard || v_played,
          active_color = v_active_color,
          drawn_card_id = null,
          announced = false,
          vulnerable_seat = null,
          winner_seat = v_me,
          round_points = v_pts,
          last_message = v_name || ' pose sa dernière carte et gagne !'
    where room_id = p_room;

    update public.party_rooms set phase = 'ended' where id = p_room;
    return;
  end if;

  v_dir := s.direction;
  v_pending := s.pending_draw;

  -- UNO 7-1 rule: 7 swaps hands, 1 rotates all hands in play direction
  if v_seven_zero and (v_last ->> 'kind') = 'num' and v_n >= 2 then
    if (v_last ->> 'value')::int = 7 then
      if p_swap_target is not null and p_swap_target <> v_me and p_swap_target >= 0 and p_swap_target < v_n then
        v_target := p_swap_target;
      else
        v_target := -1;
        v_best_count := 999999;
        for i in 0 .. v_n - 1 loop
          if i <> v_me then
            v_cnt := jsonb_array_length(v_seats -> i -> 'hand');
            if v_cnt < v_best_count then
              v_best_count := v_cnt;
              v_target := i;
            end if;
          end if;
        end loop;
        if v_target < 0 then
          v_target := (v_me + 1) % v_n;
        end if;
      end if;
      v_my_hand := v_seats -> v_me -> 'hand';
      v_target_hand := v_seats -> v_target -> 'hand';
      v_seats := jsonb_set(v_seats, array[v_me::text, 'hand'], v_target_hand);
      v_seats := jsonb_set(v_seats, array[v_target::text, 'hand'], v_my_hand);
      v_event := v_event || ' Échange de mains avec ' || (v_seats -> v_target ->> 'name') || ' (Règle du 7) !';
    elsif (v_last ->> 'value')::int = 1 then
      v_rotated := '[]'::jsonb;
      for i in 0 .. v_n - 1 loop
        v_from_idx := (((i - v_dir) % v_n) + v_n) % v_n;
        v_rotated := v_rotated || jsonb_build_array(
          jsonb_set(v_seats -> i, '{hand}', v_seats -> v_from_idx -> 'hand')
        );
      end loop;
      v_seats := v_rotated;
      v_event := v_event || ' Rotation de toutes les mains (Règle du 1) !';
    end if;
  end if;

  -- Save intermediate state before optional penalty draw
  update public.chroma_secrets
    set seats = v_seats,
        discard = s.discard || v_played,
        active_color = v_active_color,
        vulnerable_seat = null
  where room_id = p_room;

  -- Check UNO announcement when dropping to 1 card
  if jsonb_array_length(v_seats -> v_me -> 'hand') = 1 and not s.announced then
    if p_keep_vulnerable then
      v_vulnerable := v_me;
      v_event := v_event || ' Attention : « 1 ! » non annoncé (Contre-1 disponible) !';
    else
      perform public.chroma_draw_cards(p_room, v_me, 2);
      v_event := v_event || ' Oubli de « Dernière carte ! » : +2.';
    end if;
  end if;

  -- Action effects
  case (v_last ->> 'kind')
    when 'bond' then
      v_steps := 2;
      v_next_idx := (((v_me + v_dir) % v_n) + v_n) % v_n;
      v_event := v_event || ' ' || (v_seats -> v_next_idx ->> 'name') || ' passe son tour.';
    when 'retour' then
      if v_n = 2 then
        v_steps := 2;
        v_event := v_event || ' ' || v_name || ' rejoue.';
      else
        v_dir := case when v_dir = 1 then -1 else 1 end;
        v_event := v_event || ' Le sens du jeu s’inverse.';
      end if;
    when 'plus2' then
      v_pending := v_pending + 2;
    when 'surcharge' then
      v_pending := v_pending + 3;
    else
      null;
  end case;

  v_next_idx := (((v_me + v_dir * v_steps) % v_n) + v_n) % v_n;

  update public.chroma_secrets
    set current_seat = v_next_idx,
        direction = v_dir,
        pending_draw = v_pending,
        drawn_card_id = null,
        announced = false,
        vulnerable_seat = v_vulnerable,
        last_message = v_event
  where room_id = p_room;
end;
$$;

/** Internal draw execution shared by human turns and bot turns. */
create or replace function public.chroma_apply_draw(p_room uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  r public.party_rooms;
  s public.chroma_secrets;
  v_me int;
  v_n int;
  v_name text;
  v_drawn jsonb;
  v_card jsonb;
  v_top jsonb;
  v_stacking boolean;
  v_next_idx int;
begin
  select * into r from public.party_rooms where id = p_room;
  select * into s from public.chroma_secrets where room_id = p_room for update;

  if s.winner_seat is not null then
    raise exception 'La manche est déjà terminée' using errcode = '22023';
  end if;

  v_me := s.current_seat;
  v_n := jsonb_array_length(s.seats);
  v_name := s.seats -> v_me ->> 'name';
  v_next_idx := (((v_me + s.direction) % v_n) + v_n) % v_n;

  if s.pending_draw > 0 then
    v_drawn := public.chroma_draw_cards(p_room, v_me, s.pending_draw);
    update public.chroma_secrets
      set current_seat = v_next_idx,
          pending_draw = 0,
          drawn_card_id = null,
          announced = false,
          vulnerable_seat = null,
          last_message = v_name || ' pioche ' || jsonb_array_length(v_drawn)::text || ' cartes.'
    where room_id = p_room;
    return;
  end if;

  if s.drawn_card_id is not null then
    raise exception 'Tu as déjà pioché ce tour-ci' using errcode = '22023';
  end if;

  v_drawn := public.chroma_draw_cards(p_room, v_me, 1);
  if jsonb_array_length(v_drawn) = 0 then
    update public.chroma_secrets
      set current_seat = v_next_idx,
          drawn_card_id = null,
          announced = false,
          vulnerable_seat = null,
          last_message = v_name || ' ne peut pas piocher et passe.'
    where room_id = p_room;
    return;
  end if;

  v_card := v_drawn -> 0;
  select * into s from public.chroma_secrets where room_id = p_room;
  v_top := s.discard -> (jsonb_array_length(s.discard) - 1);
  v_stacking := coalesce((r.settings ->> 'stacking')::boolean, true);

  if public.chroma_can_play(v_card, v_top, s.active_color, s.pending_draw, (v_card ->> 'id')::int, v_stacking) then
    update public.chroma_secrets
      set drawn_card_id = (v_card ->> 'id')::int,
          vulnerable_seat = null,
          last_message = v_name || ' pioche une carte jouable.'
    where room_id = p_room;
  else
    update public.chroma_secrets
      set current_seat = v_next_idx,
          drawn_card_id = null,
          announced = false,
          vulnerable_seat = null,
          last_message = v_name || ' pioche et passe.'
    where room_id = p_room;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Public RPCs for Chroma Clash Online (authenticated room members only)
-- ----------------------------------------------------------------------------
create or replace function public.chroma_update_settings(p_room uuid, p_settings jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.party_rooms := public.party_room_for_update(p_room);
  v_members int;
  v_bots int;
  v_combos boolean;
  v_stacking boolean;
  v_seven_zero boolean;
begin
  if r.game <> 'chroma-clash' then
    raise exception 'Salon incompatible' using errcode = '22023';
  end if;
  if r.host_id <> public.party_uid() or r.status <> 'lobby' then
    raise exception 'Seul l’hôte peut modifier les règles avant le départ' using errcode = '42501';
  end if;
  select count(*) into v_members from public.party_members where room_id = p_room;
  v_bots := greatest(0, least(8 - v_members, coalesce((p_settings ->> 'bots')::int, (r.settings ->> 'bots')::int, 1)));
  v_combos := coalesce((p_settings ->> 'combos')::boolean, (r.settings ->> 'combos')::boolean, true);
  v_stacking := coalesce((p_settings ->> 'stacking')::boolean, (r.settings ->> 'stacking')::boolean, true);
  v_seven_zero := coalesce((p_settings ->> 'sevenZero')::boolean, (r.settings ->> 'sevenZero')::boolean, true);

  update public.party_rooms
    set settings = jsonb_build_object(
      'bots', v_bots,
      'combos', v_combos,
      'stacking', v_stacking,
      'sevenZero', v_seven_zero
    )
  where id = p_room;
  perform public.party_touch(p_room);
end;
$$;

create or replace function public.chroma_start(p_room uuid, p_keep_scores boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.party_rooms := public.party_room_for_update(p_room);
  prev_s public.chroma_secrets;
  bot_names constant text[] := array['Ion', 'Néon', 'Volt', 'Flux', 'Arc', 'Delta', 'Quark'];
  v_bots int;
  v_seats jsonb := '[]'::jsonb;
  v_deck jsonb;
  v_first jsonb;
  v_first_idx int;
  v_draw jsonb;
  v_hand jsonb;
  v_total int;
  v_prev_score int;
  m record;
  i int;
begin
  if r.game <> 'chroma-clash' then
    raise exception 'Salon incompatible' using errcode = '22023';
  end if;
  if r.host_id <> public.party_uid() then
    raise exception 'Seul l’hôte peut lancer la partie' using errcode = '42501';
  end if;

  select * into prev_s from public.chroma_secrets where room_id = p_room;

  -- Build human seats in join order
  i := 0;
  for m in select user_id, name from public.party_members where room_id = p_room order by seat loop
    v_prev_score := 0;
    if p_keep_scores and prev_s.room_id is not null and i < jsonb_array_length(prev_s.seats) then
      v_prev_score := coalesce((prev_s.seats -> i ->> 'score')::int, 0);
    end if;
    v_seats := v_seats || jsonb_build_array(jsonb_build_object(
      'name', m.name,
      'bot', false,
      'user_id', m.user_id::text,
      'hand', '[]'::jsonb,
      'score', v_prev_score
    ));
    i := i + 1;
  end loop;

  v_bots := greatest(0, least(8 - i, coalesce((r.settings ->> 'bots')::int, 1)));
  for b in 1 .. v_bots loop
    v_prev_score := 0;
    if p_keep_scores and prev_s.room_id is not null and i < jsonb_array_length(prev_s.seats) then
      v_prev_score := coalesce((prev_s.seats -> i ->> 'score')::int, 0);
    end if;
    v_seats := v_seats || jsonb_build_array(jsonb_build_object(
      'name', 'Bot ' || bot_names[((b - 1) % array_length(bot_names, 1)) + 1],
      'bot', true,
      'user_id', null,
      'hand', '[]'::jsonb,
      'score', v_prev_score
    ));
    i := i + 1;
  end loop;

  v_total := jsonb_array_length(v_seats);
  if v_total < 2 or v_total > 8 then
    raise exception 'Il faut entre 2 et 8 joueurs pour lancer Chroma Clash' using errcode = '22023';
  end if;

  -- Generate and shuffle the 102-card deck on the server
  with raw_cards as (
    select 'num'::text as kind, c as color, v as value
    from unnest(array['cyan', 'rose', 'ambre', 'vert']) as c
    cross join generate_series(1, 9) as v
    cross join generate_series(1, 2) as copy
    union all
    select k as kind, c as color, null::int as value
    from unnest(array['cyan', 'rose', 'ambre', 'vert']) as c
    cross join unnest(array['bond', 'retour', 'plus2']) as k
    cross join generate_series(1, 2) as copy
    union all
    select 'prisme'::text, null::text, null::int from generate_series(1, 4)
    union all
    select 'surcharge'::text, null::text, null::int from generate_series(1, 2)
  ),
  numbered as (
    select (row_number() over () - 1)::int as id, kind, color, value
    from raw_cards
  )
  select jsonb_agg(
    case
      when value is not null then jsonb_build_object('id', id, 'kind', kind, 'color', color, 'value', value)
      else jsonb_build_object('id', id, 'kind', kind, 'color', color)
    end
    order by random()
  ) into v_deck
  from numbered;

  -- Deal 7 cards to each seat
  for i in 0 .. v_total - 1 loop
    select jsonb_agg(v_deck -> idx)
      into v_hand
    from generate_series(i * 7, i * 7 + 6) as idx;
    v_seats := jsonb_set(v_seats, array[i::text, 'hand'], v_hand);
  end loop;

  -- Remaining cards form the draw pile; pick the first number card for initial discard
  select coalesce(jsonb_agg(v_deck -> idx), '[]'::jsonb)
    into v_draw
  from generate_series(v_total * 7, jsonb_array_length(v_deck) - 1) as idx;

  v_first_idx := 0;
  for idx in 0 .. jsonb_array_length(v_draw) - 1 loop
    if (v_draw -> idx ->> 'kind') = 'num' then
      v_first_idx := idx;
      exit;
    end if;
  end loop;
  v_first := v_draw -> v_first_idx;
  v_draw := v_draw - v_first_idx;

  insert into public.chroma_secrets (
    room_id, seats, draw, discard, current_seat, direction, active_color,
    pending_draw, drawn_card_id, announced, vulnerable_seat, winner_seat,
    round_points, last_message
  ) values (
    p_room, v_seats, v_draw, jsonb_build_array(v_first), 0, 1, v_first ->> 'color',
    0, null, false, null, null,
    0, 'La partie commence sur ' || public.chroma_card_label(v_first) || '.'
  )
  on conflict (room_id) do update set
    seats = excluded.seats,
    draw = excluded.draw,
    discard = excluded.discard,
    current_seat = excluded.current_seat,
    direction = excluded.direction,
    active_color = excluded.active_color,
    pending_draw = excluded.pending_draw,
    drawn_card_id = excluded.drawn_card_id,
    announced = excluded.announced,
    vulnerable_seat = excluded.vulnerable_seat,
    winner_seat = excluded.winner_seat,
    round_points = excluded.round_points,
    last_message = excluded.last_message;

  update public.party_rooms
    set status = 'playing',
        phase = 'playing',
        round = round + 1,
        winner = null
  where id = p_room;
  perform public.party_touch(p_room);
end;
$$;

create or replace function public.chroma_play(
  p_room uuid,
  p_card_ids int[],
  p_color text default null,
  p_swap_target int default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.party_uid();
  r public.party_rooms := public.party_room_for_update(p_room);
  s public.chroma_secrets;
begin
  if r.game <> 'chroma-clash' or r.status <> 'playing' then
    raise exception 'Aucune manche en cours' using errcode = '22023';
  end if;
  select * into s from public.chroma_secrets where room_id = p_room for update;
  if (s.seats -> s.current_seat ->> 'user_id') is distinct from uid::text then
    raise exception 'Ce n’est pas ton tour de jouer' using errcode = '42501';
  end if;
  perform public.chroma_apply_play(p_room, p_card_ids, p_color, p_swap_target, true);
  perform public.party_touch(p_room);
end;
$$;

create or replace function public.chroma_draw(p_room uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.party_uid();
  r public.party_rooms := public.party_room_for_update(p_room);
  s public.chroma_secrets;
begin
  if r.game <> 'chroma-clash' or r.status <> 'playing' then
    raise exception 'Aucune manche en cours' using errcode = '22023';
  end if;
  select * into s from public.chroma_secrets where room_id = p_room for update;
  if (s.seats -> s.current_seat ->> 'user_id') is distinct from uid::text then
    raise exception 'Ce n’est pas ton tour de piocher' using errcode = '42501';
  end if;
  perform public.chroma_apply_draw(p_room);
  perform public.party_touch(p_room);
end;
$$;

create or replace function public.chroma_pass(p_room uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.party_uid();
  r public.party_rooms := public.party_room_for_update(p_room);
  s public.chroma_secrets;
  v_n int;
  v_next_idx int;
  v_name text;
begin
  if r.game <> 'chroma-clash' or r.status <> 'playing' then
    raise exception 'Aucune manche en cours' using errcode = '22023';
  end if;
  select * into s from public.chroma_secrets where room_id = p_room for update;
  if (s.seats -> s.current_seat ->> 'user_id') is distinct from uid::text then
    raise exception 'Ce n’est pas ton tour' using errcode = '42501';
  end if;
  if s.drawn_card_id is null then
    raise exception 'Pioche d’abord une carte avant de passer' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(s.seats);
  v_next_idx := (((s.current_seat + s.direction) % v_n) + v_n) % v_n;
  v_name := s.seats -> s.current_seat ->> 'name';

  update public.chroma_secrets
    set current_seat = v_next_idx,
        drawn_card_id = null,
        announced = false,
        vulnerable_seat = null,
        last_message = v_name || ' garde sa carte et passe.'
  where room_id = p_room;
  perform public.party_touch(p_room);
end;
$$;

create or replace function public.chroma_announce(p_room uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.party_uid();
  r public.party_rooms := public.party_room_for_update(p_room);
  s public.chroma_secrets;
begin
  if r.game <> 'chroma-clash' or r.status <> 'playing' then
    raise exception 'Aucune manche en cours' using errcode = '22023';
  end if;
  select * into s from public.chroma_secrets where room_id = p_room for update;
  if (s.seats -> s.current_seat ->> 'user_id') is distinct from uid::text then
    raise exception 'Ce n’est pas ton tour' using errcode = '42501';
  end if;
  update public.chroma_secrets set announced = true where room_id = p_room;
  perform public.party_touch(p_room);
end;
$$;

create or replace function public.chroma_counter_uno(p_room uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.party_rooms := public.party_room_for_update(p_room);
  s public.chroma_secrets;
  v_target int;
  v_target_name text;
begin
  if r.game <> 'chroma-clash' or r.status <> 'playing' then
    raise exception 'Aucune manche en cours' using errcode = '22023';
  end if;
  select * into s from public.chroma_secrets where room_id = p_room for update;
  if s.winner_seat is not null or s.vulnerable_seat is null then
    return;
  end if;
  v_target := s.vulnerable_seat;
  v_target_name := s.seats -> v_target ->> 'name';
  perform public.chroma_draw_cards(p_room, v_target, 2);
  update public.chroma_secrets
    set vulnerable_seat = null,
        last_message = 'Contre-1 ! ' || v_target_name || ' pioche +2 cartes pour oubli d’annonce.'
  where room_id = p_room;
  perform public.party_touch(p_room);
end;
$$;

create or replace function public.chroma_bot_step(p_room uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.party_rooms := public.party_room_for_update(p_room);
  s public.chroma_secrets;
  v_me int;
  v_n int;
  v_next_idx int;
  v_next_count int;
  v_seat jsonb;
  v_hand jsonb;
  v_top jsonb;
  v_combos boolean;
  v_stacking boolean;
  v_first jsonb;
  v_ids int[];
  v_color text := null;
  v_next_turn int;
begin
  if r.game <> 'chroma-clash' or r.status <> 'playing' then
    return;
  end if;
  select * into s from public.chroma_secrets where room_id = p_room for update;
  if s.winner_seat is not null then
    return;
  end if;

  v_me := s.current_seat;
  v_seat := s.seats -> v_me;
  if not coalesce((v_seat ->> 'bot')::boolean, false) then
    return;
  end if;

  v_n := jsonb_array_length(s.seats);
  v_next_idx := (((v_me + s.direction) % v_n) + v_n) % v_n;
  v_next_count := jsonb_array_length(s.seats -> v_next_idx -> 'hand');
  v_hand := v_seat -> 'hand';
  v_top := s.discard -> (jsonb_array_length(s.discard) - 1);
  v_combos := coalesce((r.settings ->> 'combos')::boolean, true);
  v_stacking := coalesce((r.settings ->> 'stacking')::boolean, true);

  -- Pick highest-scoring playable card in bot's secret hand
  select elem into v_first
  from jsonb_array_elements(v_hand) as elem
  where public.chroma_can_play(elem, v_top, s.active_color, s.pending_draw, s.drawn_card_id, v_stacking)
  order by
    case
      when (elem ->> 'kind') in ('prisme', 'surcharge') then
        case when (elem ->> 'kind') = 'surcharge' and v_next_count <= 2 then 90 else 5 end
      when (elem ->> 'kind') <> 'num' then
        case when v_next_count <= 2 then 80 else 30 end
      else 40 + coalesce((elem ->> 'value')::int, 0)
    end desc
  limit 1;

  if v_first is null then
    if s.drawn_card_id is not null then
      v_next_turn := (((s.current_seat + s.direction) % v_n) + v_n) % v_n;
      update public.chroma_secrets
        set current_seat = v_next_turn,
            drawn_card_id = null,
            announced = false,
            vulnerable_seat = null,
            last_message = (v_seat ->> 'name') || ' garde sa carte et passe.'
      where room_id = p_room;
    else
      perform public.chroma_apply_draw(p_room);
    end if;
    perform public.party_touch(p_room);
    return;
  end if;

  v_ids := array[(v_first ->> 'id')::int];
  if v_combos and s.drawn_card_id is null and (v_first ->> 'kind') = 'num' then
    select array_agg((elem ->> 'id')::int)
      into v_ids
    from (
      select v_first as elem
      union all
      select e from jsonb_array_elements(v_hand) as e
      where (e ->> 'id')::int <> (v_first ->> 'id')::int
        and (e ->> 'kind') = 'num'
        and (e ->> 'value')::int = (v_first ->> 'value')::int
    ) q;
  end if;

  if (v_first ->> 'kind') in ('prisme', 'surcharge') then
    select coalesce(
      (
        select e ->> 'color'
        from jsonb_array_elements(v_hand) as e
        where not ((e ->> 'id')::int = any(v_ids)) and (e ->> 'color') is not null
        group by e ->> 'color'
        order by count(*) desc
        limit 1
      ),
      (array['cyan', 'rose', 'ambre', 'vert'])[1 + floor(random() * 4)::int]
    ) into v_color;
  end if;

  update public.chroma_secrets set announced = true where room_id = p_room;
  perform public.chroma_apply_play(p_room, v_ids, v_color, null, false);
  perform public.party_touch(p_room);
end;
$$;

create or replace function public.chroma_back_to_lobby(p_room uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.party_rooms := public.party_room_for_update(p_room);
begin
  if r.game <> 'chroma-clash' then
    raise exception 'Salon incompatible' using errcode = '22023';
  end if;
  if r.host_id <> public.party_uid() then
    raise exception 'Seul l’hôte peut rouvrir le salon' using errcode = '42501';
  end if;
  delete from public.chroma_secrets where room_id = p_room;
  update public.party_rooms
    set status = 'lobby',
        phase = 'lobby',
        winner = null
  where id = p_room;
  perform public.party_touch(p_room);
end;
$$;

/**
 * Player-scoped view of a Chroma Clash room:
 * - Returns ONLY the calling player's hand (`my_hand`).
 * - Other seats only expose `hand_count` (never their cards).
 * - The draw pile only exposes `draw_count` (never its cards).
 */
create or replace function public.chroma_state(p_room uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := public.party_uid();
  r public.party_rooms;
  s public.chroma_secrets;
  v_members jsonb;
  v_public_seats jsonb := '[]'::jsonb;
  v_my_seat int := null;
  v_my_hand jsonb := '[]'::jsonb;
  v_seat jsonb;
  i int;
begin
  select * into r from public.party_rooms where id = p_room;
  if not found or not exists (
    select 1 from public.party_members m where m.room_id = p_room and m.user_id = uid
  ) then
    raise exception 'Salon introuvable' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', m.user_id,
    'name', m.name,
    'seat', m.seat,
    'is_host', m.user_id = r.host_id,
    'is_me', m.user_id = uid
  ) order by m.seat), '[]'::jsonb)
    into v_members
  from public.party_members m
  where m.room_id = p_room;

  select * into s from public.chroma_secrets where room_id = p_room;
  if not found or r.status = 'lobby' then
    return jsonb_build_object(
      'room', jsonb_build_object(
        'id', r.id,
        'code', r.code,
        'status', r.status,
        'phase', r.phase,
        'round', r.round,
        'settings', r.settings,
        'host_id', r.host_id,
        'version', r.version,
        'server_now', now()
      ),
      'me', jsonb_build_object(
        'user_id', uid,
        'is_host', r.host_id = uid
      ),
      'members', v_members,
      'table', null
    );
  end if;

  for i in 0 .. jsonb_array_length(s.seats) - 1 loop
    v_seat := s.seats -> i;
    if (v_seat ->> 'user_id') = uid::text then
      v_my_seat := i;
      v_my_hand := coalesce(v_seat -> 'hand', '[]'::jsonb);
    end if;
    v_public_seats := v_public_seats || jsonb_build_array(jsonb_build_object(
      'seat', i,
      'name', v_seat ->> 'name',
      'bot', coalesce((v_seat ->> 'bot')::boolean, false),
      'is_me', (v_seat ->> 'user_id') = uid::text,
      'hand_count', jsonb_array_length(coalesce(v_seat -> 'hand', '[]'::jsonb)),
      'score', coalesce((v_seat ->> 'score')::int, 0)
    ));
  end loop;

  return jsonb_build_object(
    'room', jsonb_build_object(
      'id', r.id,
      'code', r.code,
      'status', r.status,
      'phase', r.phase,
      'round', r.round,
      'settings', r.settings,
      'host_id', r.host_id,
      'version', r.version,
      'server_now', now()
    ),
    'me', jsonb_build_object(
      'user_id', uid,
      'is_host', r.host_id = uid
    ),
    'members', v_members,
    'table', jsonb_build_object(
      'top_card', s.discard -> (jsonb_array_length(s.discard) - 1),
      'draw_count', jsonb_array_length(s.draw),
      'current_seat', s.current_seat,
      'direction', s.direction,
      'active_color', s.active_color,
      'pending_draw', s.pending_draw,
      'drawn_card_id', case when v_my_seat = s.current_seat then s.drawn_card_id else null end,
      'announced', s.announced,
      'vulnerable_seat', s.vulnerable_seat,
      'winner_seat', s.winner_seat,
      'round_points', s.round_points,
      'last_event', s.last_message,
      'my_seat', v_my_seat,
      'my_hand', v_my_hand,
      'seats', v_public_seats
    )
  );
end;
$$;

-- Lock down internal helpers and expose only the authenticated RPCs
revoke all on function
  public.chroma_color_label(text),
  public.chroma_card_label(jsonb),
  public.chroma_hand_points(jsonb),
  public.chroma_can_play(jsonb, jsonb, text, int, int, boolean),
  public.chroma_draw_cards(uuid, int, int),
  public.chroma_apply_play(uuid, int[], text, int, boolean),
  public.chroma_apply_draw(uuid),
  public.chroma_update_settings(uuid, jsonb),
  public.chroma_start(uuid, boolean),
  public.chroma_play(uuid, int[], text, int),
  public.chroma_draw(uuid),
  public.chroma_pass(uuid),
  public.chroma_announce(uuid),
  public.chroma_counter_uno(uuid),
  public.chroma_bot_step(uuid),
  public.chroma_back_to_lobby(uuid),
  public.chroma_state(uuid)
from public, anon, authenticated;

grant execute on function
  public.chroma_update_settings(uuid, jsonb),
  public.chroma_start(uuid, boolean),
  public.chroma_play(uuid, int[], text, int),
  public.chroma_draw(uuid),
  public.chroma_pass(uuid),
  public.chroma_announce(uuid),
  public.chroma_counter_uno(uuid),
  public.chroma_bot_step(uuid),
  public.chroma_back_to_lobby(uuid),
  public.chroma_state(uuid)
to authenticated;

