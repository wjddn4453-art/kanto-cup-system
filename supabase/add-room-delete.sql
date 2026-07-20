create or replace function public.delete_auction_room(
  p_room_code text,
  p_admin_key text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h text;
begin
  select admin_key_hash into h
  from public.auction_rooms
  where room_code = upper(trim(p_room_code));

  if h is null or extensions.crypt(p_admin_key, h) <> h then
    raise exception '방 코드 또는 운영 비밀번호가 올바르지 않습니다.';
  end if;

  delete from public.auction_rooms
  where room_code = upper(trim(p_room_code));
end;
$$;

grant execute on function public.delete_auction_room(text,text)
to anon, authenticated;
