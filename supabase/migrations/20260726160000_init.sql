-- Fornsök Boulder Finder schema
create extension if not exists postgis;

create type public.block_source as enum ('fornsok', 'user');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  source public.block_source not null default 'user',
  fornsok_id text unique,
  name text not null,
  description text,
  lamningstyp text,
  egenskapsvarde text,
  lat double precision not null,
  lng double precision not null,
  location geography(point, 4326)
    generated always as (
      st_setsrid(st_makepoint(lng, lat), 4326)::geography
    ) stored,
  climb_score smallint check (climb_score is null or (climb_score between 1 and 5)),
  score_rationale text,
  county text,
  municipality text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fornsok_id_required check (
    (source = 'fornsok' and fornsok_id is not null)
    or (source = 'user')
  )
);

create index blocks_location_idx on public.blocks using gist (location);
create index blocks_climb_score_idx on public.blocks (climb_score);
create index blocks_source_idx on public.blocks (source);
create index blocks_municipality_idx on public.blocks (municipality);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.blocks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now()
);

create index photos_block_id_idx on public.photos (block_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger blocks_updated_at
  before update on public.blocks
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.blocks enable row level security;
alter table public.photos enable row level security;

create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Blocks are publicly readable"
  on public.blocks for select
  using (true);

create policy "Authenticated users can insert user blocks"
  on public.blocks for insert
  to authenticated
  with check (
    source = 'user'
    and created_by = auth.uid()
  );

create policy "Users can update own user blocks"
  on public.blocks for update
  to authenticated
  using (source = 'user' and created_by = auth.uid())
  with check (source = 'user' and created_by = auth.uid());

create policy "Users can delete own user blocks"
  on public.blocks for delete
  to authenticated
  using (source = 'user' and created_by = auth.uid());

create policy "Photos are publicly readable"
  on public.photos for select
  using (true);

create policy "Authenticated users can insert photos"
  on public.photos for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can delete own photos"
  on public.photos for delete
  to authenticated
  using (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('block-photos', 'block-photos', true)
on conflict (id) do nothing;

create policy "Public read block photos"
  on storage.objects for select
  using (bucket_id = 'block-photos');

create policy "Authenticated upload block photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'block-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own block photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'block-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
