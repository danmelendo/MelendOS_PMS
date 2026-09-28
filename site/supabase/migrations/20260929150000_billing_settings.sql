-- Who issues Melend/OS's invoices (the invoice document of /admin/ →
-- Facturación). One row, edited from the panel; empty until Melend/OS is
-- registered (the document then says "pendiente" instead of inventing data).
create table public.sales_settings (
  id                boolean primary key default true check (id),
  issuer_name       text,
  issuer_tax_id     text,
  issuer_address    text,
  issuer_email      text,
  issuer_phone      text,
  iban              text,
  payment_days      integer not null default 15 check (payment_days between 0 and 120),
  invoice_note      text,
  updated_at        timestamptz not null default now()
);
insert into public.sales_settings (id) values (true);

alter table public.sales_settings enable row level security;
revoke all on public.sales_settings from anon, authenticated;
grant select, update on public.sales_settings to authenticated;
create policy "sales admins" on public.sales_settings for all to authenticated
  using (public.is_sales_admin()) with check (public.is_sales_admin());
create trigger sales_settings_touch before update on public.sales_settings
  for each row execute function public.touch_updated_at();

-- Invoices remember who they were issued by and to (the client or our own
-- details may change later; an issued invoice must not).
alter table public.client_invoices
  add column issuer jsonb,
  add column recipient jsonb;

create or replace function public.issue_client_invoice(p_invoice uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from current_date);
  v_seq int;
  v_number text;
  v_issuer jsonb;
begin
  if not public.is_sales_admin() then
    raise exception 'Sin permiso' using errcode = 'insufficient_privilege';
  end if;
  select to_jsonb(s) - 'id' - 'updated_at' into v_issuer from public.sales_settings s;
  perform pg_advisory_xact_lock(hashtext('client_invoices_number'));
  select coalesce(max(split_part(number, '-', 3)::int), 0) + 1 into v_seq
    from public.client_invoices where number like 'MOS-' || v_year || '-%';
  v_number := format('MOS-%s-%s', v_year, lpad(v_seq::text, 4, '0'));
  update public.client_invoices i
     set status = 'issued', number = v_number, issued_on = current_date,
         due_on = coalesce(i.due_on, current_date + coalesce((v_issuer->>'payment_days')::int, 15)),
         issuer = v_issuer,
         recipient = (select jsonb_build_object(
                         'name', coalesce(c.legal_name, c.name), 'trade_name', c.name,
                         'tax_id', c.tax_id, 'address', c.billing_address, 'email', c.billing_email)
                        from public.clients c where c.id = i.client_id)
   where i.id = p_invoice and i.status = 'draft';
  if not found then
    raise exception 'La factura no existe o ya está emitida' using errcode = 'no_data_found';
  end if;
  return v_number;
end;
$$;

-- The guard also keeps who issued and received an issued invoice.
create or replace function public.guard_client_invoice()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Solo se borran borradores; una factura emitida se anula' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if old.status <> 'draft' and (
       new.client_id is distinct from old.client_id or new.base is distinct from old.base
    or new.vat_rate is distinct from old.vat_rate or new.concept is distinct from old.concept
    or new.number is distinct from old.number or new.issued_on is distinct from old.issued_on
    or new.period_start is distinct from old.period_start or new.period_end is distinct from old.period_end
    or new.issuer is distinct from old.issuer or new.recipient is distinct from old.recipient) then
    raise exception 'Una factura emitida no se modifica' using errcode = 'check_violation';
  end if;
  if old.status in ('paid', 'cancelled') and new.status is distinct from old.status then
    raise exception 'La factura ya está cerrada' using errcode = 'check_violation';
  end if;
  if new.status = 'draft' and old.status <> 'draft' then
    raise exception 'Una factura emitida no vuelve a borrador' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
