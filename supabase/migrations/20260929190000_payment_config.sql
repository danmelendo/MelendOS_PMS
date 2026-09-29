-- The hotel configures its own payment gateway (TPV) from the panel (Dan,
-- 29/09/2026: "el botón de TPV para hotel sea configurable para el TPV de cada
-- banco que utilice"). Almost every Spanish bank issues its TPV virtual on
-- Redsys, so the hotel enters the merchant code, terminal and secret key its
-- bank gave it; Stripe is the alternative. The secret goes to Vault; the panel
-- only ever sees whether it is set, never its value. Management only.
--
-- Writes payment_accounts (one active provider per hotel) and the Vault secret
-- in the same call, like save_verifactu_certificate.

-- What the panel shows: the active gateway of a hotel, without any secret.
create or replace function public.payment_account_status(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_row public.payment_accounts%rowtype;
begin
  if not public.has_tenant_role(p_tenant, 'admin') then
    raise exception 'Solo dirección puede ver la configuración de cobros' using errcode = 'insufficient_privilege';
  end if;
  select * into v_row from public.payment_accounts where tenant_id = p_tenant and active;
  if v_row.id is null then
    return jsonb_build_object('configured', false);
  end if;
  return jsonb_build_object(
    'configured', true,
    'provider', v_row.provider,
    'test_mode', v_row.test_mode,
    'public_config', v_row.public_config,
    'has_secret', v_row.secret_name is not null);
end;
$$;
revoke execute on function public.payment_account_status(uuid) from public, anon;
grant execute on function public.payment_account_status(uuid) to authenticated;

-- Saves (or rotates) the hotel's gateway. Redsys: p_config = {merchant_code,
-- terminal, bank_name}, p_secret = the SHA-256 key (base64). Stripe: p_config =
-- {publishable_key, bank_name}, p_secret = secret key, p_secret2 = webhook
-- secret (kept if omitted on a later edit). Only one provider stays active.
create or replace function public.save_payment_account(
  p_tenant uuid, p_provider text, p_test_mode boolean, p_config jsonb,
  p_secret text default null, p_secret2 text default null)
returns void language plpgsql security definer set search_path = public, vault as $$
declare
  v_name text := 'payments/' || p_tenant::text || '/' || p_provider;
  v_existing public.payment_accounts%rowtype;
begin
  if not public.has_tenant_role(p_tenant, 'admin') then
    raise exception 'Solo dirección puede configurar los cobros' using errcode = 'insufficient_privilege';
  end if;
  if p_provider not in ('redsys', 'stripe') then
    raise exception 'Pasarela no soportada' using errcode = 'check_violation';
  end if;
  select * into v_existing from public.payment_accounts where tenant_id = p_tenant and provider = p_provider::public.payment_provider;

  if p_provider = 'redsys' then
    if coalesce(p_config->>'merchant_code', '') !~ '^[0-9]{9}$' then
      raise exception 'El número de comercio (FUC) debe tener 9 dígitos' using errcode = 'check_violation';
    end if;
    if p_secret is null and v_existing.secret_name is null then
      raise exception 'Falta la clave secreta del TPV' using errcode = 'check_violation';
    end if;
    if p_secret is not null then
      if p_secret !~ '^[A-Za-z0-9+/=]{16,}$' then
        raise exception 'La clave del TPV debe ir en Base64 (la que da el banco)' using errcode = 'check_violation';
      end if;
      perform public.vault_upsert(v_name, p_secret);
    end if;
  else
    if p_secret is not null then perform public.vault_upsert(v_name || '/secret_key', p_secret); end if;
    if p_secret2 is not null then perform public.vault_upsert(v_name || '/webhook_secret', p_secret2); end if;
    if v_existing.secret_name is null and p_secret is null then
      raise exception 'Falta la clave secreta de Stripe' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.payment_accounts (tenant_id, provider, test_mode, public_config, secret_name, active)
  values (p_tenant, p_provider::public.payment_provider, p_test_mode,
          coalesce(p_config, '{}'::jsonb), v_name, true)
  on conflict (tenant_id, provider) do update
    set test_mode = excluded.test_mode, public_config = excluded.public_config,
        secret_name = excluded.secret_name, active = true;
  -- Only one provider active per hotel.
  update public.payment_accounts set active = false
   where tenant_id = p_tenant and provider <> p_provider::public.payment_provider;

  insert into public.audit_log (tenant_id, user_id, action, entity, entity_id)
  values (p_tenant, auth.uid(), 'payment_account.saved', 'payment_accounts', p_tenant);
end;
$$;
revoke execute on function public.save_payment_account(uuid, text, boolean, jsonb, text, text) from public, anon;
grant execute on function public.save_payment_account(uuid, text, boolean, jsonb, text, text) to authenticated;

-- Small Vault helper, so the function above stays readable.
create or replace function public.vault_upsert(p_name text, p_secret text)
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then perform vault.create_secret(p_secret, p_name, 'Payment gateway secret');
  else perform vault.update_secret(v_id, p_secret); end if;
end;
$$;
revoke execute on function public.vault_upsert(text, text) from public, anon, authenticated;

-- Turns off the gateway (does not delete the Vault secret, in case of a slip).
create or replace function public.disable_payment_account(p_tenant uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_tenant_role(p_tenant, 'admin') then
    raise exception 'Solo dirección puede configurar los cobros' using errcode = 'insufficient_privilege';
  end if;
  update public.payment_accounts set active = false where tenant_id = p_tenant;
  insert into public.audit_log (tenant_id, user_id, action, entity, entity_id)
  values (p_tenant, auth.uid(), 'payment_account.disabled', 'payment_accounts', p_tenant);
end;
$$;
revoke execute on function public.disable_payment_account(uuid) from public, anon;
grant execute on function public.disable_payment_account(uuid) to authenticated;
