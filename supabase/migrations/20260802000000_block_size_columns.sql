  -- Boulder size fields for filtering (parsed from Fornsök text or LLM).
  alter table public.blocks
    add column height_m real,
    add column length_m real,
    add column width_m real,
    add column area_m2 real,
    add column size_source text;

  alter table public.blocks
    add constraint blocks_size_source_check
    check (size_source is null or size_source in ('parsed', 'llm', 'manual'));

  create index blocks_height_m_idx on public.blocks (height_m);
  create index blocks_area_m2_idx on public.blocks (area_m2);
