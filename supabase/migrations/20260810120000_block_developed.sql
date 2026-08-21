-- Community flag: boulder has been developed (established / climbed).
alter table public.blocks
  add column developed boolean not null default false;

create index blocks_developed_idx on public.blocks (developed)
  where developed;

-- Authenticated users may set/clear developed on any block (last write wins).
-- RPC avoids opening full-row UPDATE via RLS.
create or replace function public.set_block_developed(
  p_block_id uuid,
  p_developed boolean
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

  if p_developed is null then
    raise exception 'developed must be true or false';
  end if;

  update public.blocks
  set developed = p_developed
  where id = p_block_id
  returning * into updated;

  if updated.id is null then
    raise exception 'Block not found';
  end if;

  return updated;
end;
$$;

revoke all on function public.set_block_developed(uuid, boolean) from public;
grant execute on function public.set_block_developed(uuid, boolean) to authenticated;
