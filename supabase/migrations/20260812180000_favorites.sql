-- Per-user favorites (stars) for saving blocks to revisit later.
create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  block_id uuid not null references public.blocks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, block_id)
);

create index favorites_user_id_idx on public.favorites (user_id);
create index favorites_block_id_idx on public.favorites (block_id);

alter table public.favorites enable row level security;

create policy "Users can read own favorites"
  on public.favorites for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own favorites"
  on public.favorites for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete own favorites"
  on public.favorites for delete
  to authenticated
  using (auth.uid() = user_id);
