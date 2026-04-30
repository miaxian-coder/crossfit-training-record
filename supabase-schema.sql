create table public.crossfit_stores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  training_records jsonb not null default '[]'::jsonb,
  pr_records jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.crossfit_stores enable row level security;

create policy "Users manage their own store"
on public.crossfit_stores
for all
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
