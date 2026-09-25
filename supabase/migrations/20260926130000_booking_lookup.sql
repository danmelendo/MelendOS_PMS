-- ─────────────────────────────────────────────────────────────────────────────
-- "Manage my booking" on the public web without an account: the guest finds a
-- booking with its reference and the email it was made with, like airlines
-- (locator + surname). Each lookup issues an extra access token, so the link
-- the guest already has (confirmation email, agent) keeps working.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.booking_access_tokens (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  reservation_id  uuid not null,
  token_hash      text not null unique,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '30 days',
  foreign key (tenant_id, reservation_id) references public.reservations (tenant_id, id) on delete cascade
);
create index booking_access_tokens_reservation_idx on public.booking_access_tokens (reservation_id);
-- Only the security-definer functions below touch it.
alter table public.booking_access_tokens enable row level security;

-- A booking opened with a token: the one stored on the booking, or any
-- unexpired token issued by a lookup.
create or replace function public.guest_booking_row(p_id uuid, p_token text)
returns public.reservations language sql stable security definer set search_path = public, extensions as $$
  select r.* from public.reservations r
  where r.id = p_id
    and p_token is not null
    and (
      (r.access_token_hash is not null
        and r.access_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex'))
      or exists (
        select 1 from public.booking_access_tokens t
         where t.reservation_id = r.id
           and t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
           and t.expires_at > now())
    );
$$;

-- Finds a booking of the hotel by reference + email and returns a fresh
-- access token for it. Null when anything does not match, so nothing can be
-- told apart (wrong reference, wrong email or another hotel).
create or replace function public.find_guest_booking(p_tenant uuid, p_reference text, p_email text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ids uuid[];
  v_token text;
begin
  if coalesce(btrim(p_reference), '') = '' or coalesce(btrim(p_email), '') = '' then
    return null;
  end if;
  select array_agg(r.id) into v_ids
    from public.reservations r
    left join public.customers c on c.id = r.customer_id
    left join public.members m on m.id = r.member_id
   where r.tenant_id = p_tenant
     and r.reference = upper(btrim(p_reference))
     and lower(coalesce(m.email, c.email)) = lower(btrim(p_email))
     and r.status not in ('rejected');
  if coalesce(array_length(v_ids, 1), 0) <> 1 then
    return null;
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.booking_access_tokens (tenant_id, reservation_id, token_hash)
  values (p_tenant, v_ids[1], encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return jsonb_build_object('id', v_ids[1], 'token', v_token);
end;
$$;

revoke execute on function public.find_guest_booking(uuid, text, text) from public;
grant execute on function public.find_guest_booking(uuid, text, text) to anon, authenticated;
revoke execute on function public.guest_booking_row(uuid, text) from public, anon, authenticated;
