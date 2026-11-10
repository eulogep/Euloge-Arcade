-- ============================================================================
-- Achievements are granted by the server, not self-declared by the client.
--
-- Before: the "user_achievements: own insert" policy let any signed-in player
-- insert any achievement id through the REST API. The unlock conditions were
-- only checked in the browser (src/features/achievements/evaluate.ts).
--
-- Now: direct writes are refused. The client asks for achievements through
-- public.claim_achievements(ids); each condition is re-checked here against the
-- player's own rows (play_events, favorites, scores).
--
-- Keep achievement_condition_met() in sync with ACHIEVEMENT_RULES in
-- src/features/achievements/evaluate.ts (a unit test checks every rule id is
-- handled here). Scores are still client-submitted, so score-based achievements
-- are only as trustworthy as the scores table.
-- ============================================================================

drop policy if exists "user_achievements: own insert" on public.user_achievements;
revoke insert, update, delete on public.user_achievements from anon, authenticated;

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
      where s.user_id = p_user and g.slug = 'system-breach'
        and s.meta -> 'victory' = 'true'::jsonb)
    when 'system-breach-flawless' then exists (
      select 1 from public.scores s join public.games g on g.id = s.game_id
      where s.user_id = p_user and g.slug = 'system-breach'
        and s.meta -> 'victory' = 'true'::jsonb
        and s.meta -> 'startLevel' = '1'::jsonb
        and s.meta -> 'deaths' = '0'::jsonb)
    when 'system-breach-5k' then exists (
      select 1 from public.scores s join public.games g on g.id = s.game_id
      where s.user_id = p_user and g.slug = 'system-breach' and s.score >= 5000)
    else false
  end;
$$;

-- Grants every requested achievement whose condition holds for the caller and
-- returns the requested ids the caller now owns (new or already unlocked).
create or replace function public.claim_achievements(p_ids text[])
returns setof text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) > 50 then
    raise exception 'invalid achievement list' using errcode = '22023';
  end if;

  insert into public.user_achievements (user_id, achievement_id)
  select v_uid, a.id
  from public.achievements a
  where a.id = any (p_ids)
    and public.achievement_condition_met(v_uid, a.id)
  on conflict do nothing;

  return query
    select ua.achievement_id
    from public.user_achievements ua
    where ua.user_id = v_uid and ua.achievement_id = any (p_ids);
end;
$$;

revoke execute on function public.achievement_condition_met(uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_achievements(text[]) from public, anon;
grant execute on function public.claim_achievements(text[]) to authenticated;
