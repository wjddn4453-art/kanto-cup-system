-- v0.1 데이터 구조 초안
-- 다음 단계에서 이 SQL을 Supabase SQL Editor에 붙여넣게 됩니다.

create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  room_code text unique not null,
  admin_pin text not null,
  status text not null default 'setup',
  created_at timestamptz not null default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id) on delete cascade,
  name text not null,
  join_code text not null,
  points integer not null default 1000,
  created_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id) on delete cascade,
  name text not null,
  tier text,
  main_role text,
  sub_role text,
  status text not null default 'waiting',
  roulette_excluded boolean not null default false,
  sold_team_id uuid references teams(id) on delete set null,
  sold_price integer,
  created_at timestamptz not null default now()
);

create table if not exists auction_state (
  tournament_id uuid primary key references tournaments(id) on delete cascade,
  current_player_id uuid references players(id) on delete set null,
  highest_team_id uuid references teams(id) on delete set null,
  current_price integer not null default 0,
  timer_seconds integer not null default 15,
  is_running boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists bids (
  id bigint generated always as identity primary key,
  tournament_id uuid references tournaments(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  amount integer not null,
  created_at timestamptz not null default now()
);

create or replace function public.verify_auction_room(p_room_code text,p_admin_key text) returns boolean language plpgsql security definer set search_path=public as $$
declare h text;
begin
  select admin_key_hash into h from public.auction_rooms where room_code=upper(trim(p_room_code));
  return h is not null and crypt(p_admin_key,h)=h;
end;
$$;
grant execute on function public.verify_auction_room(text,text) to anon,authenticated;
