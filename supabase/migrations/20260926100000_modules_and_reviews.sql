-- ─────────────────────────────────────────────────────────────────────────────
-- Stay phase (A): modules per hotel and guest reviews.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Modules ──────────────────────────────────────────────────────────────────
-- Same rule as supabase/functions/_shared/domain/features.ts: the loyalty club
-- comes with the pro/group plans (chains, large hotels); starter hotels only
-- register their guests. tenants.settings.features overrides any module.
create or replace function public.tenant_feature(p_tenant uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (t.settings->'features'->>p_feature)::boolean,
    case p_feature when 'loyalty' then t.plan in ('pro', 'group') else true end
  )
  from public.tenants t where t.id = p_tenant;
$$;
grant execute on function public.tenant_feature(uuid, text) to anon, authenticated;

-- No points without the club.
create or replace function public.award_stay_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_points integer;
  v_ppe numeric;
begin
  if new.member_id is null or not new.deposit_paid or old.deposit_paid
     or not coalesce(public.tenant_feature(new.tenant_id, 'loyalty'), false) then
    return new;
  end if;
  select coalesce(t.points_per_euro, 1) into v_ppe
    from public.loyalty_accounts a
    left join public.loyalty_tiers t on t.id = a.tier_id
   where a.member_id = new.member_id;
  v_points := round(new.total * coalesce(v_ppe, 1));
  if v_points <= 0 then
    return new;
  end if;
  insert into public.loyalty_accounts (tenant_id, member_id, points, lifetime_points)
  values (new.tenant_id, new.member_id, v_points, v_points)
  on conflict (tenant_id, member_id) do update
    set points = loyalty_accounts.points + v_points,
        lifetime_points = loyalty_accounts.lifetime_points + v_points;
  insert into public.loyalty_transactions (tenant_id, member_id, type, points, reason, reservation_id)
  values (new.tenant_id, new.member_id, 'earn', v_points, 'Estancia confirmada', new.id);
  insert into public.booking_journal (tenant_id, booking_ref, member_id, property_id, event_type, actor, payload)
  values (new.tenant_id, new.id::text, new.member_id, new.property_id, 'points_earned', 'system',
          jsonb_build_object('points', v_points));
  return new;
end;
$$;

create or replace function public.redeem_reward(p_member_id uuid, p_reward_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  m public.members%rowtype;
  rw public.rewards%rowtype;
  acc public.loyalty_accounts%rowtype;
begin
  select * into m from public.members where id = p_member_id;
  if not found or not public.is_member_user(m.tenant_id, m.id) then
    raise exception 'Cuenta no encontrada' using errcode = 'no_data_found';
  end if;
  if not public.tenant_feature(m.tenant_id, 'loyalty') then
    raise exception 'Este hotel no tiene club de fidelización' using errcode = 'check_violation';
  end if;
  select * into rw from public.rewards where id = p_reward_id and tenant_id = m.tenant_id and active;
  if not found then
    raise exception 'Recompensa no encontrada' using errcode = 'no_data_found';
  end if;
  select * into acc from public.loyalty_accounts where member_id = m.id for update;
  if not found or acc.points < rw.cost_points then
    raise exception 'Puntos insuficientes' using errcode = 'check_violation';
  end if;
  update public.loyalty_accounts set points = points - rw.cost_points where id = acc.id;
  insert into public.loyalty_transactions (tenant_id, member_id, type, points, reason)
  values (m.tenant_id, m.id, 'redeem', -rw.cost_points, 'Canje · ' || rw.name);
  insert into public.booking_journal (tenant_id, booking_ref, member_id, event_type, actor, payload)
  values (m.tenant_id, 'reward-' || rw.id, m.id, 'reward_redeemed', 'member',
          jsonb_build_object('reward', rw.name, 'points', rw.cost_points));
  return acc.points - rw.cost_points;
end;
$$;

-- ── Reviews ──────────────────────────────────────────────────────────────────
-- Only guests of a completed stay can review it, once. Reviews are published
-- straight away (negative ones cannot be hidden); the hotel can reply.
create table public.reviews (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  reservation_id  uuid not null unique,
  property_id     uuid,
  rating          smallint not null check (rating between 1 and 5),
  -- Optional scores 1-5: cleanliness, staff, location, comfort, value.
  scores          jsonb not null default '{}'::jsonb,
  comment         text check (length(comment) <= 2000),
  -- Shown publicly: first name and initial, e.g. "Laura G."
  author_name     text not null,
  created_at      timestamptz not null default now(),
  reply           text check (length(reply) <= 2000),
  replied_at      timestamptz,
  replied_by      uuid references auth.users(id) on delete set null,
  simulated       boolean not null default false,
  foreign key (tenant_id, reservation_id) references public.reservations (tenant_id, id) on delete cascade,
  foreign key (tenant_id, property_id) references public.properties (tenant_id, id)
);
create index reviews_property_idx on public.reviews (property_id, created_at desc);
create index reviews_tenant_idx on public.reviews (tenant_id, created_at desc);

alter table public.reviews enable row level security;
-- Staff read their hotel's reviews with the booking behind them. The public
-- reads them through get_reviews(), which leaves the booking out.
create policy reviews_staff_read on public.reviews
  for select to authenticated using (public.is_tenant_member(tenant_id));

create or replace function public.review_author(p_name text)
returns text language sql immutable set search_path = public as $$
  select case
    when coalesce(btrim(p_name), '') = '' then 'Huésped'
    when position(' ' in btrim(p_name)) = 0 then btrim(p_name)
    else split_part(btrim(p_name), ' ', 1) || ' ' || upper(left(split_part(btrim(p_name), ' ', 2), 1)) || '.'
  end;
$$;

-- Guest submits a review: with the booking token (no account) or signed in as
-- the member who made the booking.
create or replace function public.submit_review(
  p_reservation_id uuid, p_token text, p_rating int, p_scores jsonb default '{}'::jsonb,
  p_comment text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  r public.reservations%rowtype;
  v_name text;
  v_id uuid;
  v_scores jsonb;
begin
  if p_token is not null then
    select * into r from public.guest_booking_row(p_reservation_id, p_token);
  else
    select * into r from public.reservations
     where id = p_reservation_id and member_id is not null
       and public.is_member_user(tenant_id, member_id);
  end if;
  if r.id is null then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if r.status <> 'completed' then
    raise exception 'Solo se puede valorar una estancia terminada' using errcode = 'check_violation';
  end if;
  if not public.tenant_feature(r.tenant_id, 'reviews') then
    raise exception 'Este hotel no recoge valoraciones' using errcode = 'check_violation';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'La nota va de 1 a 5' using errcode = 'check_violation';
  end if;
  -- Keep only known scores, each 1-5.
  select coalesce(jsonb_object_agg(k, (v #>> '{}')::int), '{}'::jsonb) into v_scores
    from jsonb_each(coalesce(p_scores, '{}'::jsonb)) as e(k, v)
   where k in ('cleanliness', 'staff', 'location', 'comfort', 'value')
     and jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between 1 and 5;
  select coalesce(m.name, c.name) into v_name
    from public.reservations x
    left join public.members m on m.id = x.member_id
    left join public.customers c on c.id = x.customer_id
   where x.id = r.id;
  insert into public.reviews (tenant_id, reservation_id, property_id, rating, scores, comment, author_name)
  values (r.tenant_id, r.id, r.property_id, p_rating, v_scores,
          nullif(btrim(left(p_comment, 2000)), ''), public.review_author(v_name))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Esta estancia ya tiene una valoración' using errcode = 'unique_violation';
end;
$$;

-- Hotel staff reply (or edit their reply).
create or replace function public.reply_review(p_review_id uuid, p_reply text)
returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.reviews where id = p_review_id;
  if v_tenant is null or not public.is_tenant_member(v_tenant) then
    raise exception 'Valoración no encontrada' using errcode = 'no_data_found';
  end if;
  update public.reviews
     set reply = nullif(btrim(left(p_reply, 2000)), ''),
         replied_at = case when nullif(btrim(p_reply), '') is null then null else now() end,
         replied_by = auth.uid()
   where id = p_review_id;
end;
$$;

-- Public reviews of a hotel (property) or of a whole tenant, newest first, with
-- the summary. No booking or guest data beyond the author's first name.
create or replace function public.get_reviews(
  p_property uuid default null, p_tenant uuid default null, p_limit int default 20
) returns jsonb language sql stable security definer set search_path = public as $$
  with r as (
    select * from public.reviews
     where (p_property is null or property_id = p_property)
       and (p_tenant is null or tenant_id = p_tenant)
       and (p_property is not null or p_tenant is not null)
  )
  select jsonb_build_object(
    'count', (select count(*) from r),
    'average', (select round(avg(rating)::numeric, 2) from r),
    'distribution', (select coalesce(jsonb_object_agg(rating, n), '{}'::jsonb)
                       from (select rating, count(*) as n from r group by rating) d),
    'scores', (select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) from (
                 select k, round(avg((v #>> '{}')::numeric), 2) as a
                   from r, jsonb_each(r.scores) as e(k, v) group by k) s),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', id, 'property_id', property_id, 'rating', rating, 'scores', scores,
                   'comment', comment, 'author_name', author_name, 'created_at', created_at,
                   'reply', reply, 'replied_at', replied_at) order by created_at desc)
                 from (select * from r order by created_at desc limit least(greatest(p_limit, 1), 100)) x),
                 '[]'::jsonb)
  );
$$;

revoke execute on function public.submit_review(uuid, text, int, jsonb, text) from public;
revoke execute on function public.reply_review(uuid, text) from public, anon;
revoke execute on function public.get_reviews(uuid, uuid, int) from public;
revoke execute on function public.review_author(text) from public, anon, authenticated;
grant execute on function public.submit_review(uuid, text, int, jsonb, text) to anon, authenticated;
grant execute on function public.reply_review(uuid, text) to authenticated;
grant execute on function public.get_reviews(uuid, uuid, int) to anon, authenticated;
