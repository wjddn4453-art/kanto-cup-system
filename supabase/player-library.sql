-- Run once in Supabase SQL Editor. Independent of temporary auction rooms.
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.auction_player_libraries (
  owner_id text primary key,
  key_hash text not null,
  players jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.auction_player_libraries enable row level security;
revoke all on public.auction_player_libraries from anon, authenticated;
create or replace function public.read_auction_player_library(p_key text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v public.auction_player_libraries%rowtype;
begin
  if length(p_key)<8 then raise exception '선수 명단 비밀번호는 8자 이상이어야 합니다.'; end if;
  select * into v from public.auction_player_libraries where owner_id=encode(extensions.digest(p_key,'sha256'),'hex');
  if not found then return '[]'::jsonb; end if;
  if extensions.crypt(p_key,v.key_hash)<>v.key_hash then raise exception '명단 접근 실패'; end if;
  return v.players;
end $$;
create or replace function public.write_auction_player_library(p_key text,p_players jsonb)
returns void language plpgsql security definer set search_path=public,extensions as $$
declare v_id text;
begin
  if length(p_key)<8 then raise exception '선수 명단 비밀번호는 8자 이상이어야 합니다.'; end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players)>1000 then raise exception '선수 명단 형식이 올바르지 않습니다.'; end if;
  v_id:=encode(extensions.digest(p_key,'sha256'),'hex');
  insert into public.auction_player_libraries(owner_id,key_hash,players)
  values(v_id,extensions.crypt(p_key,extensions.gen_salt('bf')),p_players)
  on conflict(owner_id) do update set players=excluded.players,updated_at=now();
end $$;
grant execute on function public.read_auction_player_library(text) to anon,authenticated;
grant execute on function public.write_auction_player_library(text,jsonb) to anon,authenticated;
