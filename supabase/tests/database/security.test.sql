-- Server-side authorization & validation tests. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

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
select throws_ok(
  $$insert into public.games (slug, title, description, genre, launch_mode, launch_url, license_status)
    values ('hack', 'Hack', 'xxxxxxxxxxxx', array['arcade'], 'external', 'https://example.com', 'link_only')$$,
  '42501', null, 'anon cannot insert games');
select ok((select count(*) from public.game_popularity(30)) >= 0, 'anon can read aggregated popularity');
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
