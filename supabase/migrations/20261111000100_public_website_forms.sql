begin;

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null
    check (provider in (
      'website',
      'whatsapp',
      'facebook_lead_ads',
      'instagram',
      'google_forms',
      'email',
      'phone'
    )),
  status text not null default 'connected'
    check (status in ('connected', 'disconnected', 'needs_attention')),
  display_name text not null default '',
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  unique (id, user_id)
);

comment on column public.integration_connections.metadata is
  'Non-secret display/configuration metadata only. Never store provider credentials here.';

create table if not exists public.website_forms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  connection_id uuid not null,
  public_id uuid not null unique default gen_random_uuid(),
  title text not null default 'Contact us'
    check (char_length(trim(title)) between 1 and 120),
  fields jsonb not null default
    '[{"key":"name","label":"Name","required":true},{"key":"email","label":"Email","required":false},{"key":"phone","label":"Phone","required":false},{"key":"company","label":"Company","required":false}]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint website_forms_fields_are_array check (jsonb_typeof(fields) = 'array'),
  constraint website_forms_require_name check (
    fields @> '[{"key":"name","required":true}]'::jsonb
  ),
  constraint website_forms_connection_owner_fk
    foreign key (connection_id, user_id)
    references public.integration_connections (id, user_id)
);

create index if not exists website_forms_user_created_idx
  on public.website_forms (user_id, created_at desc);

drop trigger if exists set_integration_connection_updated_at
  on public.integration_connections;
create trigger set_integration_connection_updated_at
  before update on public.integration_connections
  for each row execute function public.set_lead_updated_at();

drop trigger if exists set_website_form_updated_at on public.website_forms;
create trigger set_website_form_updated_at
  before update on public.website_forms
  for each row execute function public.set_lead_updated_at();

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_channel text not null
    check (source_channel in (
      'website',
      'whatsapp',
      'facebook_lead_ads',
      'instagram',
      'google_forms',
      'email',
      'phone'
    )),
  connection_id uuid,
  form_id uuid,
  external_event_id text not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'received'
    check (status in ('received', 'processing', 'processed', 'failed', 'rate_limited')),
  lead_id uuid references public.leads (id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint webhook_events_has_source check (
    connection_id is not null or form_id is not null
  ),
  constraint webhook_events_connection_owner_fk
    foreign key (connection_id, user_id)
    references public.integration_connections (id, user_id),
  constraint webhook_events_form_owner_fk
    foreign key (form_id, user_id)
    references public.website_forms (id, user_id)
);

create unique index if not exists webhook_events_connection_event_idx
  on public.webhook_events (connection_id, external_event_id)
  where connection_id is not null;

create unique index if not exists webhook_events_form_event_idx
  on public.webhook_events (form_id, external_event_id)
  where form_id is not null;

create index if not exists webhook_events_user_received_idx
  on public.webhook_events (user_id, received_at desc);

create table if not exists public.website_form_rate_limits (
  window_start timestamptz not null,
  scope_hash text not null,
  submission_count integer not null default 0 check (submission_count > 0),
  primary key (window_start, scope_hash)
);

alter table public.website_form_rate_limits enable row level security;

alter table public.leads
  add column if not exists source_channel text not null default 'manual',
  add column if not exists source_connection_id uuid,
  add column if not exists source_form_id uuid;

update public.leads
set source_channel = case lower(trim(source))
  when 'website' then 'website'
  when 'whatsapp' then 'whatsapp'
  when 'facebook' then 'facebook_lead_ads'
  when 'facebook lead ads' then 'facebook_lead_ads'
  when 'instagram' then 'instagram'
  when 'google forms' then 'google_forms'
  when 'email' then 'email'
  when 'phone' then 'phone'
  when 'call' then 'phone'
  else 'manual'
end
where source_channel = 'manual';

alter table public.leads
  add constraint leads_source_channel_check
  check (source_channel in (
    'manual',
    'website',
    'whatsapp',
    'facebook_lead_ads',
    'instagram',
    'google_forms',
    'email',
    'phone'
  ));

alter table public.leads
  add constraint leads_id_user_unique unique (id, user_id),
  add constraint leads_source_connection_owner_fk
    foreign key (source_connection_id, user_id)
    references public.integration_connections (id, user_id),
  add constraint leads_source_form_owner_fk
    foreign key (source_form_id, user_id)
    references public.website_forms (id, user_id);

create index if not exists leads_user_source_channel_idx
  on public.leads (user_id, source_channel, created_at desc);

create index if not exists leads_user_source_form_idx
  on public.leads (source_form_id, user_id)
  where source_form_id is not null;

alter table public.integration_connections enable row level security;
alter table public.website_forms enable row level security;
alter table public.webhook_events enable row level security;

revoke all on public.integration_connections, public.website_forms
  from public, anon;
revoke all on public.webhook_events from public, anon, authenticated;
revoke all on public.website_form_rate_limits
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.integration_connections to authenticated;
grant select, insert, update, delete on public.website_forms to authenticated;
grant select on public.webhook_events to authenticated;

drop policy if exists "Users manage their own integration connections"
  on public.integration_connections;
create policy "Users manage their own integration connections"
  on public.integration_connections for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own website forms" on public.website_forms;
create policy "Users manage their own website forms"
  on public.website_forms for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own webhook events" on public.webhook_events;
create policy "Users can read their own webhook events"
  on public.webhook_events for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own leads" on public.leads;
create policy "Users can insert their own leads"
  on public.leads for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own leads" on public.leads;
create policy "Users can update their own leads"
  on public.leads for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.submit_website_form(
  p_public_id uuid,
  p_event_id uuid,
  p_ip_hash text,
  p_payload_hash text,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form public.website_forms%rowtype;
  v_event_id uuid;
  v_existing_status text;
  v_lead_id uuid;
  v_ip_count integer;
  v_form_count integer;
  v_ip_window timestamptz;
  v_form_window timestamptz;
  v_field jsonb;
  v_key text;
  v_value text;
  v_name text;
  v_email text := '';
  v_phone text := '';
  v_company text := '';
begin
  if p_public_id is null
    or p_event_id is null
    or p_ip_hash is null
    or p_ip_hash !~ '^[0-9a-f]{64}$'
    or p_payload_hash is null
    or p_payload_hash !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_data) <> 'object'
  then
    raise exception 'Invalid form submission';
  end if;

  select *
    into v_form
    from public.website_forms
    where public_id = p_public_id
      and is_active = true;

  if not found then
    raise exception 'This form is unavailable';
  end if;

  insert into public.webhook_events (
    user_id,
    source_channel,
    connection_id,
    form_id,
    external_event_id,
    payload_hash,
    status
  )
  values (
    v_form.user_id,
    'website',
    v_form.connection_id,
    v_form.id,
    p_event_id::text,
    p_payload_hash,
    'processing'
  )
  on conflict (form_id, external_event_id) where form_id is not null
  do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select status
      into v_existing_status
      from public.webhook_events
      where form_id = v_form.id
        and external_event_id = p_event_id::text;

    if v_existing_status = 'rate_limited' then
      return jsonb_build_object('ok', false, 'rate_limited', true);
    end if;

    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  v_ip_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / 600) * 600
  );
  v_form_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / 3600) * 3600
  );

  delete from public.website_form_rate_limits
    where window_start < v_form_window - interval '24 hours';

  insert into public.website_form_rate_limits (window_start, scope_hash, submission_count)
  values (v_ip_window, 'ip:' || v_form.id::text || ':' || p_ip_hash, 1)
  on conflict (window_start, scope_hash)
  do update set submission_count = public.website_form_rate_limits.submission_count + 1
  returning submission_count into v_ip_count;

  insert into public.website_form_rate_limits (window_start, scope_hash, submission_count)
  values (v_form_window, 'form:' || v_form.id::text, 1)
  on conflict (window_start, scope_hash)
  do update set submission_count = public.website_form_rate_limits.submission_count + 1
  returning submission_count into v_form_count;

  if v_ip_count > 5 or v_form_count > 100 then
    update public.webhook_events
      set status = 'rate_limited', processed_at = now()
      where id = v_event_id;
    return jsonb_build_object('ok', false, 'rate_limited', true);
  end if;

  for v_field in
    select value from jsonb_array_elements(v_form.fields)
  loop
    v_key := v_field ->> 'key';
    v_value := nullif(trim(p_data ->> v_key), '');

    if coalesce((v_field ->> 'required')::boolean, false) and v_value is null then
      raise exception 'A required form field is missing';
    end if;

    if v_key = 'name' then
      v_name := v_value;
    elsif v_key = 'email' then
      v_email := coalesce(v_value, '');
    elsif v_key = 'phone' then
      v_phone := coalesce(v_value, '');
    elsif v_key = 'company' then
      v_company := coalesce(v_value, '');
    end if;
  end loop;

  if v_name is null then
    raise exception 'A name is required';
  end if;

  insert into public.leads (
    user_id,
    name,
    company,
    email,
    phone,
    source,
    source_channel,
    source_connection_id,
    source_form_id,
    stage,
    amount
  )
  values (
    v_form.user_id,
    v_name,
    v_company,
    v_email,
    v_phone,
    'Website form: ' || v_form.title,
    'website',
    v_form.connection_id,
    v_form.id,
    'New',
    0
  )
  returning id into v_lead_id;

  update public.webhook_events
    set status = 'processed', lead_id = v_lead_id, processed_at = now()
    where id = v_event_id;

  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;

revoke all on function public.submit_website_form(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_website_form(uuid, uuid, text, text, jsonb)
  to service_role;

commit;
