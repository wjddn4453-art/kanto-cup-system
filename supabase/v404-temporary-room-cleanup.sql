-- 기존 Supabase 프로젝트에는 이 파일만 SQL Editor에서 한 번 실행하면 됩니다.
-- 마지막 사용 후 30일이 지난 일회성 경매 작업방을 정리합니다.

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
