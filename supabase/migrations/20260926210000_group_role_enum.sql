-- Group management role (both hotels of a group, management only). Its own
-- migration: a new enum value cannot be used in the transaction that adds it.
alter type public.staff_role add value if not exists 'group';
