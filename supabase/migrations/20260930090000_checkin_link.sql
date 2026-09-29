-- Single-use online check-in link (Dan, 30/09/2026: "que se mande al huésped un
-- enlace de un solo uso, por email o SMS, para que introduzca sus datos y la
-- firma"). It is separate from the reusable "manage my booking" link the
-- confirmation email carries (chat, folio, cancellation): a check-in link opens
-- only the traveller-registry + signature flow and dies the moment the guest
-- signs, so no live link with the guest's data keeps floating around. A booking
-- being confirmed queues this invite; reception can also resend it from the
-- panel. Walk-ins without a phone are still checked in at the desk.

-- Tell manage tokens apart from single-use check-in tokens, and record when a
-- check-in token was consumed.
alter table public.booking_access_tokens
  add column if not exists purpose text not null default 'manage',
  add column if not exists used_at timestamptz;
alter table public.booking_access_tokens
  drop constraint if exists booking_access_tokens_purpose_check;
alter table public.booking_access_tokens
  add constraint booking_access_tokens_purpose_check check (purpose in ('manage', 'checkin'));

-- A booking opened with a token: the one stored on the booking, or any
-- unexpired, unconsumed access token. A used check-in link opens nothing.
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
           and t.expires_at > now()
           and t.used_at is null)
    );
$$;

-- Consumes the single-use check-in link once the guest signs the registry.
create or replace function public.sign_guest_registration(
  p_id uuid, p_token text, p_signer text, p_signature_data text
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.guest_booking_row(p_id, p_token);
  if r.id is null then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if length(coalesce(p_signer, '')) < 2 or length(coalesce(p_signature_data, '')) > 500000 then
    raise exception 'Firma no válida' using errcode = 'check_violation';
  end if;
  delete from public.signatures where reservation_id = r.id and status = 'pending';
  insert into public.signatures (tenant_id, reservation_id, doc_type, signer_name, signature_data, status, signed_at)
  values (r.tenant_id, r.id, 'guest_registration', btrim(p_signer), p_signature_data, 'signed', now());
  -- If the guest arrived through a single-use check-in link, it is spent now.
  update public.booking_access_tokens
     set used_at = now()
   where reservation_id = r.id
     and purpose = 'checkin'
     and used_at is null
     and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
end;
$$;
revoke execute on function public.sign_guest_registration(uuid, text, text, text) from public;
grant execute on function public.sign_guest_registration(uuid, text, text, text) to anon, authenticated;

-- The confirmation trigger also invites the guest to check in online. Allow the
-- new email kind and let reception resend the invite.
alter table public.guest_emails drop constraint if exists guest_emails_kind_check;
alter table public.guest_emails add constraint guest_emails_kind_check
  check (kind in ('booking_confirmed', 'booking_cancelled', 'checkin_invite'));

create or replace function public.queue_guest_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_kind text;
begin
  if new.simulated or coalesce(new.created_by_role, '') in ('ota', 'tour_operator') then
    return new;
  end if;
  -- Imported bookings were confirmed to the guest by the previous system.
  if tg_op = 'INSERT' and new.created_by_role = 'import' then
    return new;
  end if;
  if new.status::text = 'confirmed'
     and (tg_op = 'INSERT' or old.status::text in ('pending', 'rejected')) then
    v_kind := 'booking_confirmed';
  elsif tg_op = 'UPDATE' and new.status::text = 'cancelled' and old.status::text <> 'cancelled'
     -- a pending booking nobody paid for was never confirmed to the guest
     and (old.status::text <> 'pending' or new.payment_mode = 'at_hotel' or new.deposit_paid) then
    v_kind := 'booking_cancelled';
  else
    return new;
  end if;
  insert into public.guest_emails (tenant_id, reservation_id, kind)
  values (new.tenant_id, new.id, v_kind)
  on conflict (reservation_id, kind) do nothing;
  -- On confirmation, invite the guest to complete check-in online with a
  -- single-use link. Not for imports (the previous system already registered
  -- the traveller).
  if v_kind = 'booking_confirmed' and coalesce(new.created_by_role, '') <> 'import' then
    insert into public.guest_emails (tenant_id, reservation_id, kind)
    values (new.tenant_id, new.id, 'checkin_invite')
    on conflict (reservation_id, kind) do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.queue_guest_email() from public, anon, authenticated;

-- Reception (not group management) resends the check-in invite: re-queues the
-- email, which issues a fresh single-use link.
create or replace function public.request_checkin_invite(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.reservations where id = p_id;
  if v_tenant is null then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if not public.is_tenant_staff(v_tenant) or public.is_group_only(v_tenant) then
    raise exception 'Solo el personal del hotel puede enviar el enlace' using errcode = 'insufficient_privilege';
  end if;
  insert into public.guest_emails (tenant_id, reservation_id, kind)
  values (v_tenant, p_id, 'checkin_invite')
  on conflict (reservation_id, kind) do update
    set status = 'pending', attempts = 0, error = null, sent_at = null, created_at = now();
end;
$$;
revoke execute on function public.request_checkin_invite(uuid) from public, anon;
grant execute on function public.request_checkin_invite(uuid) to authenticated;
