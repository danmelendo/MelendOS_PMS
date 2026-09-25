-- The guest's own review of a stay (with the booking token or as the member who
-- booked), so the app shows it instead of the form. Null if there is none.
create or replace function public.get_my_review(p_reservation_id uuid, p_token text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r public.reservations%rowtype;
  v jsonb;
begin
  if p_token is not null then
    select * into r from public.guest_booking_row(p_reservation_id, p_token);
  else
    select * into r from public.reservations
     where id = p_reservation_id and member_id is not null
       and public.is_member_user(tenant_id, member_id);
  end if;
  if r.id is null then
    return null;
  end if;
  select jsonb_build_object('id', id, 'rating', rating, 'scores', scores, 'comment', comment,
                            'author_name', author_name, 'created_at', created_at,
                            'reply', reply, 'replied_at', replied_at)
    into v from public.reviews where reservation_id = r.id;
  return v;
end;
$$;
revoke execute on function public.get_my_review(uuid, text) from public;
grant execute on function public.get_my_review(uuid, text) to anon, authenticated;
