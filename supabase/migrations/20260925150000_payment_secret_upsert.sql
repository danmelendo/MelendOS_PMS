-- Create or rotate a payment gateway secret in Vault. Server-side only.
create or replace function public.upsert_payment_secret(p_name text, p_secret text)
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid;
begin
  if p_name !~ '^payments/[a-z0-9-]+/[a-z0-9_/-]+$' then
    raise exception 'Invalid payment secret name: %', p_name;
  end if;
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    perform vault.create_secret(p_secret, p_name, 'Payment gateway secret');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end;
$$;
revoke execute on function public.upsert_payment_secret(text, text) from public, anon, authenticated;
grant execute on function public.upsert_payment_secret(text, text) to service_role;
