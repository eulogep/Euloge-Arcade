-- Online party rooms (Loups de Minuit): authorization, secrecy and game flow.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

insert into auth.users (id, email, aud, role)
select ('00000000-0000-4000-8000-0000000000c' || i)::uuid, 'p' || i || '@party.test', 'authenticated', 'authenticated'
from generate_series(1, 5) as i;

-- Act as a given user (claims are read by auth.uid()).
create function pg_temp.act(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create temp table t (k text primary key, v text);
grant all on t to authenticated;

set local role authenticated;

-- Lobby -------------------------------------------------------------------
select pg_temp.act('00000000-0000-4000-8000-0000000000c1');
insert into t select 'room', (public.party_create_room('loups-de-minuit', '  Awa  ') ->> 'room_id');
insert into t select 'code', (select (public.party_state((select v from t where k = 'room')::uuid) -> 'room' ->> 'code'));
select matches((select v from t where k = 'code'), '^[A-Z2-9]{6}$', 'a room gets a 6-character code');
select is(
  (public.party_state((select v from t where k = 'room')::uuid) -> 'members' -> 0 ->> 'name'),
  'Awa', 'the creator is the first member, name trimmed');

select pg_temp.act('00000000-0000-4000-8000-0000000000c2');
select lives_ok($$select public.party_join_room(lower((select v from t where k = 'code')), 'Bilal')$$, 'joining by code is case-insensitive');
select throws_ok($$select public.party_join_room('ZZZZZZ', 'Bilal')$$, 'P0002', null, 'an unknown code is rejected');
select throws_ok($$select public.party_start((select v from t where k = 'room')::uuid)$$, '42501', null, 'only the host can start');
select pg_temp.act('00000000-0000-4000-8000-0000000000c3');
select throws_ok($$select public.party_join_room((select v from t where k = 'code'), 'awa')$$, '22023', null, 'names are unique in a room (case-insensitive)');
select public.party_join_room((select v from t where k = 'code'), 'Chloé');

select pg_temp.act('00000000-0000-4000-8000-0000000000c1');
select throws_ok($$select public.party_start((select v from t where k = 'room')::uuid)$$, '22023', null, 'a game needs at least 4 players');
select pg_temp.act('00000000-0000-4000-8000-0000000000c4');
select public.party_join_room((select v from t where k = 'code'), 'Dan');

select pg_temp.act('00000000-0000-4000-8000-0000000000c5');
select throws_ok($$select public.party_state((select v from t where k = 'room')::uuid)$$, 'P0002', null, 'outsiders cannot read a room');
select is((select count(*)::int from public.party_rooms), 0, 'outsiders do not see the room row either');

-- Start -------------------------------------------------------------------
select pg_temp.act('00000000-0000-4000-8000-0000000000c1');
select lives_ok($$select public.party_start((select v from t where k = 'room')::uuid)$$, 'the host starts with 4 players');
select is((select count(*)::int from public.party_rooms), 1, 'members see their room row (needed for Realtime)');

select pg_temp.act('00000000-0000-4000-8000-0000000000c5');
select throws_ok($$select public.party_join_room((select v from t where k = 'code'), 'Eve')$$, '22023', null, 'nobody joins once the game has started');

select throws_ok($$select * from public.party_secrets$$, '42501', null, 'roles are never readable directly');
select throws_ok($$select * from public.party_members$$, '42501', null, 'members are not readable directly');
select throws_ok($$select * from public.party_night_actions$$, '42501', null, 'night actions are not readable directly');

-- Roles, as seen by the test (superuser) to drive the game.
reset role;
insert into t select 'wolf', user_id::text from public.party_secrets where room_id = (select v from t where k = 'room')::uuid and role = 'loup';
insert into t select 'seer', user_id::text from public.party_secrets where room_id = (select v from t where k = 'room')::uuid and role = 'voyante';
insert into t select 'v1', user_id::text from public.party_secrets where room_id = (select v from t where k = 'room')::uuid and role = 'villageois' order by user_id limit 1;
insert into t select 'v2', user_id::text from public.party_secrets where room_id = (select v from t where k = 'room')::uuid and role = 'villageois' order by user_id desc limit 1;
select is((select count(*)::int from public.party_secrets where room_id = (select v from t where k = 'room')::uuid), 4, 'four roles dealt: 1 wolf, 1 seer, 2 villagers');
set local role authenticated;

select pg_temp.act((select v from t where k = 'v1'));
select is(
  (select count(*)::int from jsonb_array_elements(public.party_state((select v from t where k = 'room')::uuid) -> 'members') m where m ->> 'role' is not null),
  1, 'a villager only sees their own role');
select throws_ok($$select public.party_night_action((select v from t where k = 'room')::uuid, (select v from t where k = 'wolf')::uuid)$$,
  '22023', null, 'villagers have no night action');
select throws_ok($$select public.party_vote((select v from t where k = 'room')::uuid, null)$$, '22023', null, 'no vote at night');

-- Night 1 -----------------------------------------------------------------
select pg_temp.act((select v from t where k = 'seer'));
select is(
  public.party_night_action((select v from t where k = 'room')::uuid, (select v from t where k = 'wolf')::uuid) ->> 'is_wolf',
  'true', 'the seer learns the truth about the target, privately');
select throws_ok($$select public.party_night_action((select v from t where k = 'room')::uuid, (select v from t where k = 'v1')::uuid)$$,
  '22023', null, 'the seer inspects only once per night');

select pg_temp.act((select v from t where k = 'wolf'));
select throws_ok($$select public.party_night_action((select v from t where k = 'room')::uuid, (select v from t where k = 'wolf')::uuid)$$,
  '22023', null, 'a wolf cannot target the pack');
select lives_ok($$select public.party_night_action((select v from t where k = 'room')::uuid, (select v from t where k = 'v1')::uuid)$$,
  'the wolf attacks a villager');

select is(public.party_state((select v from t where k = 'room')::uuid) -> 'room' ->> 'phase', 'day', 'the night resolves once every required action is in');
select is(
  (select (m ->> 'alive')::boolean from jsonb_array_elements(public.party_state((select v from t where k = 'room')::uuid) -> 'members') m
   where m ->> 'id' = (select v from t where k = 'v1')),
  false, 'the victim is dead');
select ok(
  (public.party_state((select v from t where k = 'room')::uuid) -> 'room' -> 'last_event' ->> 'victim') is not null,
  'dawn names the victim');

-- Day → vote --------------------------------------------------------------
select pg_temp.act((select v from t where k = 'v2'));
select throws_ok($$select public.party_advance((select v from t where k = 'room')::uuid)$$, '42501', null,
  'only the host can cut the debate short');
select pg_temp.act('00000000-0000-4000-8000-0000000000c1');
-- The host may be dead (if they were the victim): host powers remain.
select lives_ok($$select public.party_advance((select v from t where k = 'room')::uuid)$$, 'the host opens the vote');

select pg_temp.act((select v from t where k = 'v1'));
select throws_ok($$select public.party_vote((select v from t where k = 'room')::uuid, (select v from t where k = 'wolf')::uuid)$$,
  '42501', null, 'dead players do not vote');

select pg_temp.act((select v from t where k = 'seer'));
select public.party_vote((select v from t where k = 'room')::uuid, (select v from t where k = 'wolf')::uuid);
select pg_temp.act((select v from t where k = 'v2'));
select public.party_vote((select v from t where k = 'room')::uuid, (select v from t where k = 'wolf')::uuid);
select is(
  (select count(*)::int from jsonb_array_elements(public.party_state((select v from t where k = 'room')::uuid) -> 'members') m where (m ->> 'voted')::boolean),
  2, 'everyone sees who has voted, not for whom');
select pg_temp.act((select v from t where k = 'wolf'));
select public.party_vote((select v from t where k = 'room')::uuid, (select v from t where k = 'seer')::uuid);

-- End ---------------------------------------------------------------------
select is(public.party_state((select v from t where k = 'room')::uuid) -> 'room' ->> 'winner', 'village', 'eliminating the last wolf: the village wins');
select is(
  (select count(*)::int from jsonb_array_elements(public.party_state((select v from t where k = 'room')::uuid) -> 'members') m where m ->> 'role' is not null),
  4, 'all roles are revealed at the end');
select is(
  (public.party_state((select v from t where k = 'room')::uuid) -> 'room' -> 'last_event' -> 'tally' -> 0 ->> 'votes')::int,
  2, 'the verdict shows the tally');

select pg_temp.act('00000000-0000-4000-8000-0000000000c1');
select lives_ok($$select public.party_advance((select v from t where k = 'room')::uuid)$$, 'the host brings everyone back to the lobby');
select is(public.party_state((select v from t where k = 'room')::uuid) -> 'room' ->> 'status', 'lobby', 'ready for another game');

select * from finish();
rollback;
