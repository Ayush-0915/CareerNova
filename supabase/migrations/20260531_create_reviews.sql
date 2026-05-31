create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  resume_text text,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists reviews_created_at_idx on public.reviews (created_at desc);
