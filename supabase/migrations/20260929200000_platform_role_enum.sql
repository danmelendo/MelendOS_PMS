-- "Administrador": Melend/OS staff with full control of every hotel, for
-- support and to review the product. The value goes in its own migration:
-- an enum value cannot be used in the transaction that adds it.
alter type public.staff_role add value if not exists 'platform';
