begin;

alter table public.leads
  add column if not exists enquiry text not null default '';

alter table public.integration_connections
  add column if not exists last_success_at timestamptz;

create table if not exists public.integration_webhook_credentials (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  credential_hash text not null unique
    check (credential_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint integration_webhook_credentials_connection_owner_fk
    foreign key (connection_id, user_id)
    references public.integration_connections (id, user_id)
    on delete cascade
);

comment on table public.integration_webhook_credentials is
  'Stores hashes only for per-user external webhook credentials. Plaintext is returned once by the management Edge Function and is never persisted.';

alter table public.integration_webhook_credentials enable row level security;
revoke all on public.integration_webhook_credentials
  from public, anon, authenticated;
grant select, insert, update, delete
  on public.integration_webhook_credentials to service_role;

create table if not exists public.integration_webhook_rate_limits (
  window_start timestamptz not null,
  scope_hash text not null,
  submission_count integer not null default 1
    check (submission_count > 0),
  primary key (window_start, scope_hash)
);

alter table public.integration_webhook_rate_limits enable row level security;
revoke all on public.integration_webhook_rate_limits
  from public, anon, authenticated, service_role;

create index if not exists integration_webhook_rate_limits_window_idx
  on public.integration_webhook_rate_limits (window_start);

create or replace function public.submit_google_forms_lead(
  p_credential_hash text,
  p_event_id text,
  p_payload_hash text,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection_id uuid;
  v_user_id uuid;
  v_event_id uuid;
  v_existing_status text;
  v_lead_id uuid;
  v_minute_window timestamptz;
  v_hour_window timestamptz;
  v_minute_count integer;
  v_hour_count integer;
  v_name text;
  v_email text;
  v_phone text;
  v_company text;
  v_enquiry text;
begin
  if p_credential_hash is null
    or p_credential_hash !~ '^[0-9a-f]{64}$'
    or p_event_id is null
    or char_length(trim(p_event_id)) < 1
    or char_length(p_event_id) > 200
    or p_payload_hash is null
    or p_payload_hash !~ '^[0-9a-f]{64}$'
    or p_data is null
    or jsonb_typeof(p_data) <> 'object'
    or jsonb_typeof(p_data -> 'name') is distinct from 'string'
  then
    raise exception 'Invalid Google Forms submission';
  end if;

  select credentials.connection_id, credentials.user_id
    into v_connection_id, v_user_id
    from public.integration_webhook_credentials as credentials
    join public.integration_connections as connections
      on connections.id = credentials.connection_id
     and connections.user_id = credentials.user_id
    where credentials.credential_hash = p_credential_hash
      and credentials.revoked_at is null
      and connections.provider = 'google_forms'
      and connections.status = 'connected';

  if not found then
    raise exception 'Invalid or inactive Google Forms credential';
  end if;

  if (p_data ? 'email' and jsonb_typeof(p_data -> 'email') <> 'string')
    or (p_data ? 'phone' and jsonb_typeof(p_data -> 'phone') <> 'string')
    or (p_data ? 'company' and jsonb_typeof(p_data -> 'company') <> 'string')
    or (p_data ? 'enquiry' and jsonb_typeof(p_data -> 'enquiry') <> 'string')
  then
    raise exception 'Invalid Google Forms field values';
  end if;

  v_name := nullif(trim(p_data ->> 'name'), '');
  v_email := coalesce(nullif(trim(p_data ->> 'email'), ''), '');
  v_phone := coalesce(nullif(trim(p_data ->> 'phone'), ''), '');
  v_company := coalesce(nullif(trim(p_data ->> 'company'), ''), '');
  v_enquiry := coalesce(nullif(trim(p_data ->> 'enquiry'), ''), '');

  if v_name is null
    or char_length(v_name) > 120
    or char_length(v_email) > 254
    or (v_email <> '' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    or char_length(v_phone) > 40
    or char_length(v_company) > 120
    or char_length(v_enquiry) > 4000
  then
    raise exception 'Invalid Google Forms field values';
  end if;

  insert into public.webhook_events (
    user_id,
    source_channel,
    connection_id,
    external_event_id,
    payload_hash,
    status
  )
  values (
    v_user_id,
    'google_forms',
    v_connection_id,
    p_event_id,
    p_payload_hash,
    'processing'
  )
  on conflict (connection_id, external_event_id)
    where connection_id is not null
  do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select status
      into v_existing_status
      from public.webhook_events
      where connection_id = v_connection_id
        and external_event_id = p_event_id;

    if v_existing_status = 'rate_limited' then
      return jsonb_build_object('ok', false, 'rate_limited', true);
    end if;

    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  v_minute_window := date_trunc('minute', clock_timestamp());
  v_hour_window := date_trunc('hour', clock_timestamp());

  delete from public.integration_webhook_rate_limits
    where window_start < v_hour_window - interval '24 hours';

  insert into public.integration_webhook_rate_limits (
    window_start, scope_hash, submission_count
  )
  values (
    v_minute_window, 'google_forms:minute:' || v_connection_id::text, 1
  )
  on conflict (window_start, scope_hash)
  do update set submission_count =
    public.integration_webhook_rate_limits.submission_count + 1
  returning submission_count into v_minute_count;

  insert into public.integration_webhook_rate_limits (
    window_start, scope_hash, submission_count
  )
  values (
    v_hour_window, 'google_forms:hour:' || v_connection_id::text, 1
  )
  on conflict (window_start, scope_hash)
  do update set submission_count =
    public.integration_webhook_rate_limits.submission_count + 1
  returning submission_count into v_hour_count;

  if v_minute_count > 10 or v_hour_count > 100 then
    update public.webhook_events
      set status = 'rate_limited', processed_at = now()
      where id = v_event_id;

    return jsonb_build_object('ok', false, 'rate_limited', true);
  end if;

  insert into public.leads (
    user_id,
    name,
    email,
    phone,
    company,
    enquiry,
    source,
    source_channel,
    source_connection_id,
    stage,
    amount
  )
  values (
    v_user_id,
    v_name,
    v_email,
    v_phone,
    v_company,
    v_enquiry,
    'Google Forms',
    'google_forms',
    v_connection_id,
    'New',
    0
  )
  returning id into v_lead_id;

  update public.webhook_events
    set status = 'processed',
        lead_id = v_lead_id,
        processed_at = now()
    where id = v_event_id;

  update public.integration_webhook_credentials
    set last_used_at = now()
    where connection_id = v_connection_id
      and credential_hash = p_credential_hash;

  update public.integration_connections
    set last_success_at = now(),
        updated_at = now()
    where id = v_connection_id
      and user_id = v_user_id;

  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;

revoke all on function public.submit_google_forms_lead(text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_google_forms_lead(text, text, text, jsonb)
  to service_role;

commit;
