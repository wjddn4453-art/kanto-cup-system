create extension if not exists pgcrypto with schema extensions;
create table if not exists public.auction_rooms(id uuid primary key default gen_random_uuid(),room_code text unique not null,admin_key_hash text not null,state jsonb not null default '{}'::jsonb,event jsonb,updated_at timestamptz not null default now());
alter table public.auction_rooms enable row level security;
drop policy if exists "public rooms are readable" on public.auction_rooms;
create policy "public rooms are readable" on public.auction_rooms for select using(true);
create or replace function public.create_auction_room(p_room_code text,p_admin_key text,p_state jsonb) returns void language plpgsql security definer set search_path=public, extensions as $$ begin insert into public.auction_rooms(room_code,admin_key_hash,state) values(upper(trim(p_room_code)),extensions.crypt(p_admin_key,extensions.gen_salt('bf')),coalesce(p_state,'{}'::jsonb)); end; $$;
create or replace function public.update_auction_room(p_room_code text,p_admin_key text,p_state jsonb,p_event jsonb default null) returns void language plpgsql security definer set search_path=public, extensions as $$ declare h text; begin select admin_key_hash into h from public.auction_rooms where room_code=upper(trim(p_room_code)); if h is null or extensions.crypt(p_admin_key,h)<>h then raise exception '운영 코드가 올바르지 않습니다.'; end if; update public.auction_rooms set state=p_state,event=p_event,updated_at=now() where room_code=upper(trim(p_room_code)); end; $$;
grant select on public.auction_rooms to anon,authenticated; grant execute on function public.create_auction_room(text,text,jsonb) to anon,authenticated; grant execute on function public.update_auction_room(text,text,jsonb,jsonb) to anon,authenticated;
do $$ begin alter publication supabase_realtime add table public.auction_rooms; exception when duplicate_object then null; end $$;
create or replace function public.verify_auction_room(p_room_code text,p_admin_key text) returns boolean language plpgsql security definer set search_path=public, extensions as $$
declare h text;
begin
  select admin_key_hash into h from public.auction_rooms where room_code=upper(trim(p_room_code));
  return h is not null and extensions.crypt(p_admin_key,h)=h;
end;
$$;
grant execute on function public.verify_auction_room(text,text) to anon,authenticated;


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
    raise exception '방 코드 또는 비밀번호가 올바르지 않습니다.';
  end if;

  delete from public.auction_rooms
  where room_code = upper(trim(p_room_code));
end;
$$;

grant execute on function public.delete_auction_room(text,text)
to anon, authenticated;

-- v4.0.4: 마지막 사용 후 30일이 지난 일회성 작업방 자동 정리
create or replace function public.cleanup_expired_auction_rooms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.auction_rooms
  where updated_at < now() - interval '30 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

grant execute on function public.cleanup_expired_auction_rooms()
to anon, authenticated;
