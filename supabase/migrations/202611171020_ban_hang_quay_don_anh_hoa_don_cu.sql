-- Bán tại quầy: mỗi đêm 03:00 dọn ẢNH hoá đơn quá 90 ngày (kho ảnh khỏi phình).
-- Hoá đơn + số tiền giữ nguyên; chỉ xoá file ảnh pos/ban/* rồi đánh dấu photo_deleted_at.
-- Xoá file phải qua Storage API (Supabase chặn xoá thẳng storage.objects) nên database gọi
-- api/don-anh-quay.js trên Vercel, xác thực bằng cùng khoá với notify_push (private.get_push_secret).
-- Chạy SAU khi code có api/don-anh-quay.js đã lên Vercel (gọi sớm chỉ nhận 404, không hỏng gì).
-- Chỉ THÊM cột + hàm + lịch, không đổi/xoá gì.
begin;
set local lock_timeout = '10s';

alter table public.pos_invoices add column if not exists photo_deleted_at timestamptz;
create index if not exists pos_invoices_anh_can_don on public.pos_invoices(created_at)
  where photo_url is not null and photo_deleted_at is null;

create or replace function public.pos_goi_don_anh_cu()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://www.sumibakery.shop/api/don-anh-quay',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', private.get_push_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
exception when others then
  raise warning 'pos don anh cu loi: %', sqlerrm;
end $$;
revoke all on function public.pos_goi_don_anh_cu() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'sumi-pos-don-anh-cu') then
      perform cron.unschedule('sumi-pos-don-anh-cu');
    end if;
    perform cron.schedule('sumi-pos-don-anh-cu', '0 20 * * *', 'select public.pos_goi_don_anh_cu()');  -- 20:00 UTC = 03:00 VN
  end if;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611171020_ban_hang_quay_don_anh_hoa_don_cu', 'completed', now(),
  'Bán tại quầy: 03:00 mỗi đêm xoá ảnh hoá đơn quá 90 ngày (pos/ban/*) qua api/don-anh-quay, giữ hoá đơn, đánh dấu photo_deleted_at.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
