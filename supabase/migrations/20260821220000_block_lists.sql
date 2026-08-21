-- Named public lists imported from Google Maps share links.
-- List pins are real blocks (source = 'list') shown only when the list is toggled on.

alter type public.block_source add value if not exists 'list';

create table public.block_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_url text not null,
  google_list_id text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint block_lists_name_length check (
    char_length(trim(name)) between 1 and 120
  )
);

create index block_lists_created_by_idx on public.block_lists (created_by);
create index block_lists_created_at_idx on public.block_lists (created_at desc);

alter table public.blocks
  add column list_id uuid references public.block_lists (id) on delete cascade;

create index blocks_list_id_idx on public.blocks (list_id)
  where list_id is not null;

-- Allow source = 'list' (and require list_id for those rows).
-- Compare the new enum as text: PostgreSQL forbids using a newly added
-- enum label in the same transaction that added it (55P04).
alter table public.blocks drop constraint fornsok_id_required;

alter table public.blocks
  add constraint fornsok_id_required check (
    (source = 'fornsok' and fornsok_id is not null and list_id is null)
    or (source = 'user' and list_id is null)
    or (source::text = 'list' and list_id is not null and fornsok_id is null)
  );

alter table public.block_lists enable row level security;

create policy "Block lists are publicly readable"
  on public.block_lists for select
  using (true);

create policy "Authenticated users can insert block lists"
  on public.block_lists for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Owners can update own block lists"
  on public.block_lists for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "Owners can delete own block lists"
  on public.block_lists for delete
  to authenticated
  using (created_by = auth.uid());

-- Extend insert policy so authenticated users can create list blocks for lists they own.
drop policy if exists "Authenticated users can insert user blocks" on public.blocks;

create policy "Authenticated users can insert user or list blocks"
  on public.blocks for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      (source = 'user' and list_id is null)
      or (
        source::text = 'list'
        and list_id is not null
        and exists (
          select 1
          from public.block_lists bl
          where bl.id = list_id
            and bl.created_by = auth.uid()
        )
      )
    )
  );

create policy "Users can delete own list blocks"
  on public.blocks for delete
  to authenticated
  using (source::text = 'list' and created_by = auth.uid());
