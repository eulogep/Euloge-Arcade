-- ============================================================================
-- System Breach daily challenge.
--
-- A challenge run is a normal row in public.scores tagged with
-- meta.challenge = 'YYYY-MM-DD' (UTC day). Every player gets the same sector
-- and modifiers that day (src/lib/dailyChallenge.ts).
--
-- - A challenge score is only accepted for the current UTC day (2 h grace
--   after midnight for runs that straddle it), so past boards are frozen.
-- - Challenge runs use modified rules (e.g. x3 fragment points), so they are
--   kept out of the all-time leaderboard and of score-based achievements.
-- Scores are still client-submitted: boards remain indicative.
-- ============================================================================

create or replace function public.validate_score_challenge()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_day text := new.meta ->> 'challenge';
begin
  if not (new.meta ? 'challenge') then
    return new;
  end if;
  if jsonb_typeof(new.meta -> 'challenge') <> 'string' or v_day !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid challenge day' using errcode = '22023';
  end if;
  if v_day not in (
    to_char(now() at time zone 'utc', 'YYYY-MM-DD'),
    to_char((now() - interval '2 hours') at time zone 'utc', 'YYYY-MM-DD')
  ) then
    raise exception 'challenge % is closed', v_day using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger scores_validate_challenge
  before insert or update on public.scores
  for each row execute function public.validate_score_challenge();

create index scores_challenge_idx on public.scores (game_id, (meta ->> 'challenge'), score desc)
  where meta ? 'challenge';

-- Daily board: best challenge score per player for one game and one day.
create or replace function public.daily_challenge_leaderboard(p_game_id uuid, p_day text, p_limit int default 10)
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
      and s.meta ? 'challenge'
      and s.meta ->> 'challenge' = p_day
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

-- All-time board: standard runs only.
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
      and not (s.meta ? 'challenge')
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

-- Score-based achievements ignore challenge runs (mirrors evaluate.ts).
create or replace function public.achievement_condition_met(p_user uuid, p_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_id
    when 'first-launch' then exists (
      select 1 from public.play_events e where e.user_id = p_user)
    when 'explorer' then (
      select count(distinct e.game_id) from public.play_events e where e.user_id = p_user) >= 3
    when 'curator' then (
      select count(*) from public.favorites f where f.user_id = p_user) >= 3
    when 'system-breach-clear' then exists (
      select 1 from public.scores s join public.games g on g.id = s.game_id
      where s.user_id = p_user and g.slug = 'system-breach' and not (s.meta ? 'challenge')
        and s.meta -> 'victory' = 'true'::jsonb)
    when 'system-breach-flawless' then exists (
      select 1 from public.scores s join public.games g on g.id = s.game_id
      where s.user_id = p_user and g.slug = 'system-breach' and not (s.meta ? 'challenge')
        and s.meta -> 'victory' = 'true'::jsonb
        and s.meta -> 'startLevel' = '1'::jsonb
        and s.meta -> 'deaths' = '0'::jsonb)
    when 'system-breach-5k' then exists (
      select 1 from public.scores s join public.games g on g.id = s.game_id
      where s.user_id = p_user and g.slug = 'system-breach' and not (s.meta ? 'challenge')
        and s.score >= 5000)
    else false
  end;
$$;

revoke execute on function public.achievement_condition_met(uuid, text) from public, anon, authenticated;
revoke execute on function public.validate_score_challenge() from public, anon, authenticated;
revoke execute on function public.daily_challenge_leaderboard(uuid, text, int) from public;
grant execute on function public.daily_challenge_leaderboard(uuid, text, int) to anon, authenticated;
revoke execute on function public.game_leaderboard(uuid, int) from public;
grant execute on function public.game_leaderboard(uuid, int) to anon, authenticated;
