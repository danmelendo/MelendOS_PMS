-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 support: human-friendly booking references and cancellation requests
-- that the hotel approves (no irreversible action without a human).
-- ─────────────────────────────────────────────────────────────────────────────

-- Short reference a guest can read out (first 8 hex digits of the id).
alter table public.reservations
  add column reference text generated always as (upper(left(replace(id::text, '-', ''), 8))) stored;
create index reservations_tenant_reference_idx on public.reservations (tenant_id, reference);

create type public.cancellation_status as enum ('pending', 'approved', 'rejected');

create table public.cancellation_requests (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  reservation_id  uuid not null,
  reason          text,
  channel         text not null default 'web' check (channel in ('web', 'web_chat', 'mcp', 'guest_app', 'staff')),
  status          public.cancellation_status not null default 'pending',
  requested_at    timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid references auth.users(id) on delete set null,
  decision_note   text,
  foreign key (tenant_id, reservation_id) references public.reservations (tenant_id, id) on delete cascade
);
create index cancellation_requests_tenant_status_idx on public.cancellation_requests (tenant_id, status);
-- One open request per reservation.
create unique index cancellation_requests_one_pending
  on public.cancellation_requests (reservation_id) where status = 'pending';

alter table public.cancellation_requests enable row level security;
-- Staff of the tenant see and decide requests; guests create them through the
-- server-side tools only (service role).
create policy cancellation_requests_staff_read on public.cancellation_requests
  for select to authenticated using (public.is_tenant_member(tenant_id));

-- Approve or reject a request. Approving cancels the reservation; refunds of
-- paid deposits are handled by the hotel with the payment provider.
create or replace function public.decide_cancellation(p_request_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare req public.cancellation_requests%rowtype;
begin
  select * into req from public.cancellation_requests where id = p_request_id for update;
  if not found or not public.is_tenant_member(req.tenant_id) then
    raise exception 'Solicitud no encontrada' using errcode = 'no_data_found';
  end if;
  if req.status <> 'pending' then
    raise exception 'La solicitud ya está resuelta' using errcode = 'check_violation';
  end if;
  update public.cancellation_requests
     set status = case when p_approve then 'approved'::public.cancellation_status else 'rejected' end,
         decided_at = now(), decided_by = auth.uid(), decision_note = p_note
   where id = req.id;
  if p_approve then
    update public.reservations
       set status = 'cancelled',
           cancellation_reason = coalesce(nullif(btrim(req.reason), ''), 'Cancelada a petición del huésped')
     where id = req.reservation_id and status in ('pending', 'confirmed');
  end if;
  insert into public.domain_events (tenant_id, event_type, entity, entity_id, actor_id, payload)
  values (req.tenant_id,
          case when p_approve then 'cancellation.approved' else 'cancellation.rejected' end,
          'reservation', req.reservation_id, auth.uid(),
          jsonb_build_object('request_id', req.id, 'channel', req.channel));
end;
$$;

revoke execute on function public.decide_cancellation(uuid, boolean, text) from public, anon;
grant execute on function public.decide_cancellation(uuid, boolean, text) to authenticated;
