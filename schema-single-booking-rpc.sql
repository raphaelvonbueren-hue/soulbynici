create or replace function public.create_single_booking(p_booking jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  new_row jsonb;
begin
  insert into bookings (date, time, duration, type, type_name, price, customer, consent, status, payment_method)
  values (
    (p_booking->>'date')::date,
    p_booking->>'time',
    coalesce((p_booking->>'duration')::int, 90),
    p_booking->>'type',
    p_booking->>'type_name',
    coalesce((p_booking->>'price')::numeric, 0),
    p_booking->'customer',
    p_booking->'consent',
    coalesce(p_booking->>'status', 'confirmed'),
    p_booking->>'payment_method'
  )
  returning to_jsonb(bookings.*) into new_row;

  return new_row;
end;
$function$;

grant execute on function public.create_single_booking(jsonb) to anon, authenticated;
