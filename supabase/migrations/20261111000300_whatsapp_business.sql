begin;

alter table public.leads
  add column if not exists enquiry text not null default '';

create table if not exists public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  waba_id text not null check (char_length(trim(waba_id)) between 1 and 128),
  phone_number_id text not null
    unique check (char_length(trim(phone_number_id)) between 1 and 128),
  display_phone_number text not null default ''
    check (char_length(display_phone_number) <= 40),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, phone_number_id),
  constraint whatsapp_accounts_connection_owner_fk
    foreign key (connection_id, user_id)
    references public.integration_connections (id, user_id)
    on delete cascade
);

comment on table public.whatsapp_accounts is
  'Non-secret WhatsApp Business account and phone-number identifiers, scoped to one LeadPocket owner.';

create index if not exists whatsapp_accounts_user_idx
  on public.whatsapp_accounts (user_id, connection_id);

alter table public.whatsapp_accounts enable row level security;
revoke all on public.whatsapp_accounts from public, anon;
grant select on public.whatsapp_accounts to authenticated;
grant select, insert, update, delete
  on public.whatsapp_accounts to service_role;

drop policy if exists "Users can read their own WhatsApp accounts"
  on public.whatsapp_accounts;
create policy "Users can read their own WhatsApp accounts"
  on public.whatsapp_accounts for select to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.whatsapp_credentials (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  access_token_ciphertext text not null
    check (
      char_length(access_token_ciphertext) between 64 and 16384
      and access_token_ciphertext ~ '^aes256gcm:v1:[A-Za-z0-9_-]+$'
    ),
  encryption_key_version integer not null default 1
    check (encryption_key_version > 0),
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint whatsapp_credentials_connection_owner_fk
    foreign key (connection_id, user_id)
    references public.integration_connections (id, user_id)
    on delete cascade
);

comment on table public.whatsapp_credentials is
  'Contains only AES-256-GCM authenticated-encryption ciphertext for Meta access tokens, encoded as aes256gcm:v1:<base64url(nonce || ciphertext || tag)>. The encryption key must exist only as a server-side Edge Function secret.';

alter table public.whatsapp_credentials enable row level security;
revoke all on public.whatsapp_credentials
  from public, anon, authenticated, service_role;
grant select, insert, update, delete
  on public.whatsapp_credentials to service_role;

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  lead_id uuid not null,
  activity_type text not null
    check (activity_type in ('call', 'meeting', 'note', 'reminder', 'whatsapp_message')),
  title text not null check (char_length(trim(title)) between 1 and 160),
  details text not null default '' check (char_length(details) <= 4000),
  occurred_at timestamptz not null default now(),
  source_connection_id uuid,
  external_event_id text,
  content_expires_at timestamptz,
  content_redacted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint whatsapp_activity_content_retention_check check (
    activity_type <> 'whatsapp_message'
    or content_expires_at is not null
  ),
  constraint activities_lead_owner_fk
    foreign key (lead_id, user_id)
    references public.leads (id, user_id)
    on delete cascade,
  constraint activities_connection_owner_fk
    foreign key (source_connection_id, user_id)
    references public.integration_connections (id, user_id)
);

comment on table public.activities is
  'Owner-scoped CRM activity timeline. WhatsApp message content is redacted after 90 days by the service-role-only purge function; schedule that function from a trusted server-side scheduler.';

create index if not exists activities_user_occurred_idx
  on public.activities (user_id, occurred_at desc);

create index if not exists activities_lead_occurred_idx
  on public.activities (lead_id, user_id, occurred_at desc);

create unique index if not exists activities_connection_event_idx
  on public.activities (source_connection_id, external_event_id)
  where source_connection_id is not null and external_event_id is not null;

alter table public.activities enable row level security;
revoke all on public.activities from public, anon, authenticated;
grant select on public.activities to authenticated;
grant select, insert, update, delete on public.activities to service_role;

drop policy if exists "Users can read their own activities" on public.activities;
create policy "Users can read their own activities"
  on public.activities for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.purge_expired_whatsapp_message_content()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_redacted_count integer;
begin
  update public.activities
    set details = '[Message content removed after retention period]',
        content_redacted_at = now()
    where activity_type = 'whatsapp_message'
      and content_expires_at <= now()
      and content_redacted_at is null;

  get diagnostics v_redacted_count = row_count;
  return v_redacted_count;
end;
$$;

revoke all on function public.purge_expired_whatsapp_message_content()
  from public, anon, authenticated;
grant execute on function public.purge_expired_whatsapp_message_content()
  to service_role;

create extension if not exists pg_cron;

do $migration$
declare
  v_job_id bigint;
begin
  select jobid
    into v_job_id
    from cron.job
    where jobname = 'whatsapp-message-content-retention';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'whatsapp-message-content-retention',
    '15 3 * * *',
    'select public.purge_expired_whatsapp_message_content();'
  );
end;
$migration$;

create table if not exists public.whatsapp_senders (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  sender_id text not null
    check (char_length(trim(sender_id)) between 1 and 200),
  sender_phone text not null default ''
    check (char_length(sender_phone) <= 40),
  sender_name text not null default ''
    check (char_length(sender_name) <= 120),
  lead_id uuid not null,
  first_message_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, sender_id),
  constraint whatsapp_senders_connection_owner_fk
    foreign key (connection_id, user_id)
    references public.integration_connections (id, user_id)
    on delete cascade,
  constraint whatsapp_senders_lead_owner_fk
    foreign key (lead_id, user_id)
    references public.leads (id, user_id)
    on delete cascade
);

comment on table public.whatsapp_senders is
  'Maps a sender identity scoped to a WhatsApp connection to the corresponding owner-scoped lead. Uses Meta sender IDs even when no phone number is available.';

create index if not exists whatsapp_senders_lead_idx
  on public.whatsapp_senders (lead_id, user_id);

alter table public.whatsapp_senders enable row level security;
revoke all on public.whatsapp_senders
  from public, anon, authenticated, service_role;

create or replace function public.process_whatsapp_message(
  p_phone_number_id text,
  p_sender_id text,
  p_sender_phone text,
  p_sender_name text,
  p_message_id text,
  p_message_type text,
  p_message_content text,
  p_occurred_at timestamptz,
  p_payload_hash text
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
  v_lead_id uuid;
  v_event_time timestamptz;
  v_previous_message_at timestamptz;
  v_sender_phone text;
  v_sender_name text;
  v_is_latest_message boolean;
  v_message_content text;
begin
  if p_phone_number_id is null
    or char_length(trim(p_phone_number_id)) not between 1 and 128
    or p_sender_id is null
    or char_length(trim(p_sender_id)) not between 1 and 200
    or p_sender_phone is not null and char_length(p_sender_phone) > 40
    or p_sender_name is not null and char_length(p_sender_name) > 120
    or p_message_id is null
    or char_length(trim(p_message_id)) not between 1 and 256
    or p_message_type is null
    or char_length(trim(p_message_type)) not between 1 and 32
    or p_message_content is not null and char_length(p_message_content) > 4000
    or p_payload_hash is null
    or p_payload_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Invalid WhatsApp message';
  end if;

  select account.connection_id, account.user_id
    into v_connection_id, v_user_id
    from public.whatsapp_accounts as account
    join public.integration_connections as connection
      on connection.id = account.connection_id
     and connection.user_id = account.user_id
    where account.phone_number_id = trim(p_phone_number_id)
      and connection.provider = 'whatsapp'
      and connection.status = 'connected';

  if not found then
    return jsonb_build_object('ok', false, 'ignored', true);
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
    'whatsapp',
    v_connection_id,
    trim(p_message_id),
    p_payload_hash,
    'processing'
  )
  on conflict (connection_id, external_event_id)
    where connection_id is not null
  do update set
    payload_hash = excluded.payload_hash,
    status = 'processing',
    received_at = now(),
    processed_at = null,
    lead_id = null
  where public.webhook_events.status in ('failed', 'received')
     or (
       public.webhook_events.status = 'processing'
       and public.webhook_events.received_at < now() - interval '5 minutes'
     )
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  begin
  v_event_time := coalesce(p_occurred_at, now());
  v_sender_phone := coalesce(nullif(trim(p_sender_phone), ''), '');
  v_sender_name := coalesce(
    nullif(trim(p_sender_name), ''),
    nullif(v_sender_phone, ''),
    'WhatsApp contact'
  );
  v_message_content := coalesce(
    nullif(trim(p_message_content), ''),
    'Received a WhatsApp ' || lower(trim(p_message_type)) || ' message.'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_connection_id::text || ':' || trim(p_sender_id),
      0
    )
  );

  select sender.lead_id,
         sender.last_message_at
    into v_lead_id,
         v_previous_message_at
    from public.whatsapp_senders as sender
    where sender.connection_id = v_connection_id
      and sender.sender_id = trim(p_sender_id)
    for update;

  if not found then
    insert into public.leads (
      user_id,
      name,
      phone,
      source,
      source_channel,
      source_connection_id,
      enquiry,
      stage,
      amount
    )
    values (
      v_user_id,
      v_sender_name,
      v_sender_phone,
      'WhatsApp',
      'whatsapp',
      v_connection_id,
      'Started via WhatsApp',
      'New',
      0
    )
    returning id into v_lead_id;

    insert into public.whatsapp_senders (
      connection_id,
      user_id,
      sender_id,
      sender_phone,
      sender_name,
      lead_id,
      first_message_at,
      last_message_at
    )
    values (
      v_connection_id,
      v_user_id,
      trim(p_sender_id),
      v_sender_phone,
      nullif(trim(p_sender_name), ''),
      v_lead_id,
      v_event_time,
      v_event_time
    );
  else
    v_is_latest_message := v_event_time >= v_previous_message_at;

    update public.whatsapp_senders
      set sender_phone = case
            when v_is_latest_message then coalesce(
              nullif(v_sender_phone, ''),
              public.whatsapp_senders.sender_phone
            )
            else public.whatsapp_senders.sender_phone
          end,
          sender_name = case
            when v_is_latest_message then coalesce(
              nullif(trim(p_sender_name), ''),
              public.whatsapp_senders.sender_name
            )
            else public.whatsapp_senders.sender_name
          end,
          last_message_at = case
            when v_is_latest_message then v_event_time
            else public.whatsapp_senders.last_message_at
          end,
          updated_at = now()
      where connection_id = v_connection_id
        and sender_id = trim(p_sender_id);

    if v_is_latest_message then
      update public.leads
        set phone = coalesce(
              nullif(v_sender_phone, ''),
              public.leads.phone
            ),
            name = coalesce(
              nullif(trim(p_sender_name), ''),
              public.leads.name
            )
        where id = v_lead_id
          and user_id = v_user_id;
    end if;
  end if;

  insert into public.activities (
    user_id,
    lead_id,
    activity_type,
    title,
    details,
    occurred_at,
    source_connection_id,
    external_event_id,
    content_expires_at
  )
  values (
    v_user_id,
    v_lead_id,
    'whatsapp_message',
    'Incoming WhatsApp message',
    v_message_content,
    v_event_time,
    v_connection_id,
    trim(p_message_id),
    now() + interval '90 days'
  )
  on conflict (source_connection_id, external_event_id)
    where source_connection_id is not null and external_event_id is not null
  do nothing;

  update public.webhook_events
    set status = 'processed',
        lead_id = v_lead_id,
        processed_at = now()
    where id = v_event_id;

  update public.whatsapp_accounts
    set last_message_at = greatest(
          coalesce(public.whatsapp_accounts.last_message_at, v_event_time),
          v_event_time
        ),
        updated_at = now()
    where connection_id = v_connection_id
      and phone_number_id = trim(p_phone_number_id);

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'lead_id', v_lead_id
  );
  exception
    when others then
      update public.webhook_events
        set status = 'failed',
            lead_id = null,
            processed_at = null
        where id = v_event_id;

      raise log 'WhatsApp message processing failed (SQLSTATE %)', SQLSTATE;

      return jsonb_build_object('ok', false, 'retryable', true);
  end;
end;
$$;

revoke all on function public.process_whatsapp_message(
  text, text, text, text, text, text, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.process_whatsapp_message(
  text, text, text, text, text, text, text, timestamptz, text
) to service_role;

commit;
