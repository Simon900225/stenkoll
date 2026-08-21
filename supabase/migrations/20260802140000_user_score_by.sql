-- Track who last set user_score so profiles can list scored blocks.
alter table public.blocks
  add column user_score_by uuid references auth.users (id) on delete set null;

create index blocks_user_score_by_idx on public.blocks (user_score_by)
  where user_score_by is not null;

create index photos_user_id_idx on public.photos (user_id);

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
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_score is not null and (p_score < 1 or p_score > 5) then
    raise exception 'Score must be between 1 and 5';
  end if;

  update public.blocks
  set
    user_score = p_score,
    user_score_by = case when p_score is null then null else uid end
  where id = p_block_id
  returning * into updated;

  if updated.id is null then
    raise exception 'Block not found';
  end if;

  return updated;
end;
$$;
