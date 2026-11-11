create table if not exists public.whatsapp_click_to_chat_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  phone_number text not null
    check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  default_message text not null default 'Hi {name}, I would like to know more about {company}.'
    check (char_length(trim(default_message)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_click_to_chat_settings enable row level security;

revoke all on public.whatsapp_click_to_chat_settings from public, anon;
grant select, insert, update, delete
  on public.whatsapp_click_to_chat_settings to authenticated;

drop policy if exists "Users can read their own WhatsApp Click-to-Chat settings"
  on public.whatsapp_click_to_chat_settings;
create policy "Users can read their own WhatsApp Click-to-Chat settings"
  on public.whatsapp_click_to_chat_settings for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own WhatsApp Click-to-Chat settings"
  on public.whatsapp_click_to_chat_settings;
create policy "Users can create their own WhatsApp Click-to-Chat settings"
  on public.whatsapp_click_to_chat_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own WhatsApp Click-to-Chat settings"
  on public.whatsapp_click_to_chat_settings;
create policy "Users can update their own WhatsApp Click-to-Chat settings"
  on public.whatsapp_click_to_chat_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own WhatsApp Click-to-Chat settings"
  on public.whatsapp_click_to_chat_settings;
create policy "Users can delete their own WhatsApp Click-to-Chat settings"
  on public.whatsapp_click_to_chat_settings for delete to authenticated
  using ((select auth.uid()) = user_id);
