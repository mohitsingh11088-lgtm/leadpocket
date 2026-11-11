begin;

alter table public.leads
  add column if not exists enquiry text not null default '';

alter table public.website_forms
  add column if not exists source_channel text not null default 'website';

alter table public.website_forms
  add constraint website_forms_source_channel_check
  check (source_channel in ('website', 'whatsapp'));

alter table public.whatsapp_click_to_chat_settings
  add column if not exists capture_form_id uuid;

alter table public.whatsapp_click_to_chat_settings
  add constraint whatsapp_click_to_chat_capture_form_owner_fk
  foreign key (capture_form_id, user_id)
  references public.website_forms (id, user_id)
  on delete cascade;

create unique index website_forms_one_whatsapp_form_per_user_idx
  on public.website_forms (user_id)
  where source_channel = 'whatsapp';

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
  v_enquiry text := '';
  v_source text;
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
    v_form.source_channel,
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
    elsif v_key = 'enquiry' then
      v_enquiry := coalesce(v_value, '');
    end if;
  end loop;

  if v_name is null then
    raise exception 'A name is required';
  end if;
  if v_form.source_channel = 'whatsapp' and v_phone = '' then
    raise exception 'A phone number is required';
  end if;

  v_source := case
    when v_form.source_channel = 'whatsapp' then 'WhatsApp'
    else 'Website form: ' || v_form.title
  end;

  insert into public.leads (
    user_id,
    name,
    company,
    email,
    phone,
    enquiry,
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
    v_enquiry,
    v_source,
    v_form.source_channel,
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
