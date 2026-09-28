-- The first run of these alerts found the channels' outbox piling up: nothing
-- called channels-dispatch except the panel's "Enviar disponibilidad". Now the
-- database calls it every minute while something is pending, like the other
-- queues (URL and key in Vault, scripts/channels-setup.mjs).
create or replace function public.channels_tick()
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_url text; v_key text;
begin
  if not exists (select 1 from public.channel_outbox where status = 'pending') then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'channels/cron_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'channels/cron_key';
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
revoke execute on function public.channels_tick() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('channels-dispatch', '* * * * *', $cron$ select public.channels_tick(); $cron$);
exception when others then
  raise notice 'pg_cron not available: channels dispatch not scheduled (%)', sqlerrm;
end $$;
