-- Server-side authorization & validation tests. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- Fixtures: one admin, one player ------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@test.local', '{"display_name":"Admin"}', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b1', 'player@test.local', '{"display_name":"Player"}', 'authenticated', 'authenticated');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';

select is(
  (select count(*)::int from public.profiles where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1')),
  2, 'a profile is created for each new auth user');

-- Anonymous visitor ---------------------------------------------------------
set local role anon;
select ok((select count(*) from public.games) > 0, 'anon can read published games');
select is((select count(*)::int from public.games where status <> 'published'), 0, 'anon never sees drafts');
select is(
  (select count(*)::int from public.games where 'party' = any (genre) and launch_mode = 'hosted'),
  3, 'the three hosted party games are published with the party genre');
select throws_ok(
  $$insert into public.games (slug, title, description, genre, launch_mode, launch_url, license_status)
    values ('hack', 'Hack', 'xxxxxxxxxxxx', array['arcade'], 'external', 'https://example.com', 'link_only')$$,
  '42501', null, 'anon cannot insert games');
select ok((select count(*) from public.game_popularity(30)) >= 0, 'anon can read aggregated popularity');
select throws_ok(
  $$select public.claim_achievements(array['first-launch'])$$,
  '42501', null, 'anon cannot claim achievements');
select ok(
  (select count(*) from public.daily_challenge_leaderboard(
    (select id from public.games where slug = 'system-breach'), '2026-01-01')) >= 0,
  'anon can read the daily challenge board');
reset role;

-- Player --------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}';

select is(public.is_admin(), false, 'player is not admin');
select throws_ok(
  $$update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000b1'$$,
  '42501', null, 'player cannot escalate own role');
select lives_ok(
  $$update public.profiles set display_name = 'Neo' where id = '00000000-0000-4000-8000-0000000000b1'$$,
  'player can rename themselves');
select is(
  (select count(*)::int from public.profiles),
  1, 'player only sees their own profile');

update public.games set title = 'pwned' where slug = 'system-breach';
select isnt((select title from public.games where slug = 'system-breach'), 'pwned', 'player cannot update games (RLS filters the row)');

select lives_ok(
  $$insert into public.favorites (game_id) select id from public.games where slug = 'system-breach'$$,
  'player can add a favorite');
select throws_ok(
  $$insert into public.favorites (user_id, game_id) select '00000000-0000-4000-8000-0000000000a1', id from public.games where slug = 'krunker'$$,
  '42501', null, 'player cannot write favorites for someone else');
select lives_ok(
  $$insert into public.play_events (game_id) select id from public.games where slug = 'system-breach'$$,
  'player can record a launch');
select lives_ok(
  $$insert into public.scores (game_id, score) select id, 4200 from public.games where slug = 'system-breach'$$,
  'player can submit a score on a score-enabled game');
select throws_ok(
  $$insert into public.scores (game_id, score) select id, 10 from public.games where slug = 'krunker'$$,
  '42501', null, 'scores are refused for games without score support');
select throws_ok(
  $$insert into public.embed_domains (domain) values ('evil.example')$$,
  '42501', null, 'player cannot extend the embed allowlist');

-- Achievements are granted by the server only (claim_achievements re-checks conditions)
select throws_ok(
  $$insert into public.user_achievements (achievement_id) values ('system-breach-flawless')$$,
  '42501', null, 'player cannot insert achievements directly');
select is(
  array(select public.claim_achievements(array['first-launch'])),
  array['first-launch'], 'an achievement whose condition holds is granted');
select is(
  (select count(*)::int from public.claim_achievements(array['curator'])),
  0, 'curator is refused with a single favorite');
select is(
  (select count(*)::int from public.claim_achievements(array['system-breach-5k'])),
  0, 'score achievement is refused below the threshold');
insert into public.scores (game_id, score) select id, 5200 from public.games where slug = 'system-breach';
select is(
  array(select public.claim_achievements(array['system-breach-5k'])),
  array['system-breach-5k'], 'score achievement is granted once a qualifying score exists');
select is(
  (select count(*)::int from public.claim_achievements(array['not-an-achievement', 'system-breach-clear'])),
  0, 'unknown ids and unmet conditions grant nothing');
select is(
  (select count(*)::int from public.user_achievements),
  2, 'player owns exactly the achievements they earned');

-- Daily challenge: today's board only, kept out of the all-time board and achievements
select lives_ok(
  $$insert into public.scores (game_id, score, meta)
    select id, 9000, jsonb_build_object('challenge', to_char(now() at time zone 'utc', 'YYYY-MM-DD'), 'victory', true)
    from public.games where slug = 'system-breach'$$,
  'a challenge score for the current UTC day is accepted');
select throws_ok(
  $$insert into public.scores (game_id, score, meta)
    select id, 99999, '{"challenge":"2020-01-01"}'::jsonb from public.games where slug = 'system-breach'$$,
  '22023', null, 'a score for a closed challenge day is rejected');
select throws_ok(
  $$insert into public.scores (game_id, score, meta)
    select id, 1, '{"challenge":"demain"}'::jsonb from public.games where slug = 'system-breach'$$,
  '22023', null, 'a malformed challenge day is rejected');
select is(
  (select score from public.daily_challenge_leaderboard(
    (select id from public.games where slug = 'system-breach'),
    to_char(now() at time zone 'utc', 'YYYY-MM-DD')) limit 1),
  9000, 'the daily board ranks challenge runs of that day');
select is(
  (select score from public.game_leaderboard((select id from public.games where slug = 'system-breach')) limit 1),
  5200, 'the all-time board ignores challenge runs');
select is(
  (select count(*)::int from public.claim_achievements(array['system-breach-clear'])),
  0, 'a challenge victory does not unlock the standard clear achievement');
reset role;

-- Admin ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select is(public.is_admin(), true, 'admin is recognised');
select lives_ok(
  $$insert into public.games (slug, title, description, genre, launch_mode, launch_url, license_status, status)
    values ('draft-test', 'Draft', 'A draft game for tests', array['arcade'], 'external', 'https://example.com/', 'link_only', 'draft')$$,
  'admin can create a draft');
select throws_ok(
  $$insert into public.games (slug, title, description, genre, launch_mode, launch_url, license_status)
    values ('embed-bad', 'Bad', 'Not in allowlist', array['arcade'], 'embed', 'https://evil.example/game', 'embed_permitted')$$,
  '22023', null, 'embedding a non-allowlisted domain is rejected');
select throws_ok(
  $$insert into public.games (slug, title, description, genre, launch_mode, launch_url, license_status)
    values ('hosted-bad', 'Bad', 'Hosted without rights', array['arcade'], 'hosted', '/games/x/index.html', 'link_only')$$,
  '22023', null, 'hosting without distribution rights is rejected');
select throws_ok(
  $$update public.games set status = 'published', license_status = 'unverified' where slug = 'draft-test'$$,
  '22023', null, 'publishing an unverified game is rejected');
select lives_ok(
  $$insert into public.games (slug, title, description, genre, launch_mode, launch_url, license_status)
    values ('embed-sub', 'Sub', 'Subdomain of an allowed domain', array['board'], 'embed', 'https://sub.lichess.org/frame', 'embed_permitted')$$,
  'subdomains of allowlisted domains are accepted');
reset role;

select * from finish();
rollback;
