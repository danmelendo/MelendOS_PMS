-- Emails to the guest about their booking. The booking web promised "te
-- enviaremos la confirmación" but nothing was sent. A trigger queues an email
-- when a booking is confirmed or cancelled; guest-emails-dispatch sends the
-- queue (Resend with RESEND_API_KEY + EMAIL_FROM, otherwise simulated) and the
-- database calls it every minute while something is pending.
-- Not queued: simulated history, and bookings from OTAs and tour operators
-- (the channel writes to its own customers).

create table public.guest_emails (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  reservation_id  uuid not null,
  kind            text not null check (kind in ('booking_confirmed', 'booking_cancelled')),
  status          text not null default 'pending'
                    check (status in ('pending', 'sent', 'simulated', 'skipped', 'failed')),
  to_email        text,
  attempts        integer not null default 0,
  error           text,
  provider_id     text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  unique (reservation_id, kind),
  foreign key (tenant_id, reservation_id) references public.reservations (tenant_id, id) on delete cascade
);
create index guest_emails_pending_idx on public.guest_emails (created_at) where status = 'pending';

-- Staff of the hotel see what was sent to their guests; only the server writes.
alter table public.guest_emails enable row level security;
create policy guest_emails_staff_read on public.guest_emails
  for select to authenticated using (public.is_tenant_member(tenant_id));
grant select on public.guest_emails to authenticated;

create or replace function public.queue_guest_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_kind text;
begin
  if new.simulated or coalesce(new.created_by_role, '') in ('ota', 'tour_operator') then
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
  return new;
end;
$$;

create trigger reservations_queue_guest_email
  after insert or update of status on public.reservations
  for each row execute function public.queue_guest_email();

-- Calls guest-emails-dispatch when something is pending (every minute). The
-- URL and key are in Vault (scripts/emails-setup.mjs).
create or replace function public.guest_emails_tick()
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_url text; v_key text;
begin
  if not exists (select 1 from public.guest_emails where status = 'pending') then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'guest-emails/cron_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'guest-emails/cron_key';
  if v_url is null or v_key is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
end;
$$;
revoke execute on function public.guest_emails_tick() from public, anon, authenticated;
revoke execute on function public.queue_guest_email() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('guest-emails-dispatch', '* * * * *', $cron$ select public.guest_emails_tick(); $cron$);
exception when others then
  raise notice 'pg_cron not available: guest emails not scheduled (%)', sqlerrm;
end $$;
