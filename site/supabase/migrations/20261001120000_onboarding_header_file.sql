-- Onboarding form: the photo for the header of the guest emails is its own
-- kind of upload (asked next to the web questions, with its recommended size).
alter table public.client_onboarding_files drop constraint client_onboarding_files_kind_check;
alter table public.client_onboarding_files add constraint client_onboarding_files_kind_check
  check (kind in ('rooms', 'reservations', 'logo', 'header', 'photos', 'other'));
