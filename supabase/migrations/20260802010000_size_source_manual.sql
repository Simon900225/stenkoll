-- Allow human-edited sizes from scoring batches.
alter table public.blocks
  drop constraint if exists blocks_size_source_check;

alter table public.blocks
  add constraint blocks_size_source_check
  check (size_source is null or size_source in ('parsed', 'llm', 'manual'));
