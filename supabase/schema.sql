create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  company text not null default '',
  email text not null default '',
  phone text not null default '',
  source text not null default 'Other',
  stage text not null default 'New'
    check (stage in ('New', 'Qualified', 'Meeting', 'Proposal', 'Won')),
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_user_updated_at_idx
  on public.leads (user_id, updated_at desc);

create or replace function public.set_lead_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_lead_updated_at on public.leads;
create trigger set_lead_updated_at
  before update on public.leads
  for each row execute function public.set_lead_updated_at();

alter table public.leads enable row level security;

grant select, insert, update, delete on public.leads to authenticated;

drop policy if exists "Users can read their own leads" on public.leads;
create policy "Users can read their own leads"
  on public.leads for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own leads" on public.leads;
create policy "Users can create their own leads"
  on public.leads for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own leads" on public.leads;
create policy "Users can update their own leads"
  on public.leads for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own leads" on public.leads;
create policy "Users can delete their own leads"
  on public.leads for delete to authenticated
  using ((select auth.uid()) = user_id);
