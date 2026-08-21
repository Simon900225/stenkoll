-- User comments on blocks (boulders).
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.blocks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint comments_body_length check (
    char_length(body) between 1 and 2000
  )
);

create index comments_block_id_created_at_idx
  on public.comments (block_id, created_at desc);

create index comments_user_id_idx on public.comments (user_id);

alter table public.comments enable row level security;

create policy "Comments are publicly readable"
  on public.comments for select
  using (true);

create policy "Authenticated users can insert own comments"
  on public.comments for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can delete own comments"
  on public.comments for delete
  to authenticated
  using (user_id = auth.uid());
