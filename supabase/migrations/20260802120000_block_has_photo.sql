-- Denormalized flag so viewport queries can filter by photo presence.
alter table public.blocks
  add column has_photo boolean not null default false;

update public.blocks b
set has_photo = exists (
  select 1 from public.photos p where p.block_id = b.id
);

create index blocks_has_photo_idx on public.blocks (has_photo);

create or replace function public.sync_block_has_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.blocks set has_photo = true where id = new.block_id and not has_photo;
    return new;
  elsif tg_op = 'DELETE' then
    update public.blocks
    set has_photo = exists (
      select 1 from public.photos p where p.block_id = old.block_id
    )
    where id = old.block_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger photos_sync_has_photo
  after insert or delete on public.photos
  for each row execute function public.sync_block_has_photo();
