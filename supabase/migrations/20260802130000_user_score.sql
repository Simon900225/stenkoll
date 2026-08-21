-- Community override for climb score. Original climb_score is preserved.
alter table public.blocks
  add column user_score smallint
    check (user_score is null or (user_score between 1 and 5));

-- Prefer user_score when set; used for map filters and sort.
alter table public.blocks
  add column display_score smallint
    generated always as (coalesce(user_score, climb_score)) stored;

create index blocks_display_score_idx on public.blocks (display_score);

-- Authenticated users may set/clear user_score on any block (last write wins).
-- RPC avoids opening full-row UPDATE via RLS.
create or replace function public.set_block_user_score(
  p_block_id uuid,
  p_score smallint
)
returns public.blocks
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.blocks;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_score is not null and (p_score < 1 or p_score > 5) then
    raise exception 'Score must be between 1 and 5';
  end if;

  update public.blocks
  set user_score = p_score
  where id = p_block_id
  returning * into updated;

  if updated.id is null then
    raise exception 'Block not found';
  end if;

  return updated;
end;
$$;

revoke all on function public.set_block_user_score(uuid, smallint) from public;
grant execute on function public.set_block_user_score(uuid, smallint) to authenticated;
