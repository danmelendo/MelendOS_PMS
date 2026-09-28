-- The guest's language (es/en), chosen on the booking web, so the emails
-- about their booking go in it. Null (panel, channels, imports): Spanish.
alter table public.reservations
  add column guest_lang text check (guest_lang in ('es', 'en'));
