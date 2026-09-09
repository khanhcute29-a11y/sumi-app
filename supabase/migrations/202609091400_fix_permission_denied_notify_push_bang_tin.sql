-- Vá lỗi thật: Giám đốc/Quản lý đăng bài "Bảng tin" (post_type='announcement')
-- bị chặn hoàn toàn với lỗi hộp hồng "permission denied for function
-- notify_push" — bài viết KHÔNG được lưu (ảnh chụp màn hình 09/09/2026).
--
-- Nguyên nhân (đối chiếu trực tiếp DB thật, không đoán):
--   - CompanyFeedScreen.jsx (Composer.send) insert thẳng vào bảng
--     `company_feed_posts` bằng vai trò `authenticated` của người dùng —
--     KHÔNG đi qua RPC SECURITY DEFINER nào.
--   - Insert đó tự kích hoạt trigger `trg_notify_new_feed_post`, hàm này
--     đang là SECURITY INVOKER (mặc định) nên chạy đúng bằng quyền của
--     người dùng đang đăng bài.
--   - Trigger gọi thẳng `public.notify_push(...)`, nhưng hàm này CHƯA từng
--     được GRANT EXECUTE cho `authenticated` (chỉ owner `postgres` gọi
--     được) -> Postgres chặn ngay tại điểm gọi hàm, lỗi văng ra TRƯỚC khi
--     vào được thân hàm notify_push, khiến khối exception có sẵn bên trong
--     notify_push (bắt lỗi net.http_post) không có cơ hội chạy, và toàn bộ
--     transaction INSERT bài viết bị rollback theo.
--
-- Hướng xử lý (an toàn hơn GRANT EXECUTE thẳng cho authenticated):
--   Đổi trigger `trg_notify_new_feed_post` sang SECURITY DEFINER (cùng chủ
--   sở hữu `postgres` với notify_push, nên tự động có quyền gọi mà không
--   cần mở thêm GRANT nào). notify_push VẪN giữ nguyên KHÔNG có quyền gọi
--   trực tiếp từ client (`supabase.rpc('notify_push', ...)`) — vì hàm này
--   không tự kiểm tra vai trò/giới hạn số lần gọi, nếu mở GRANT EXECUTE
--   thẳng cho authenticated thì BẤT KỲ nhân sự nào cũng có thể tự ý gọi để
--   spam thông báo đẩy tuỳ ý tới toàn bộ hoặc từng người — đúng rủi ro nêu
--   trong yêu cầu. Chỉ mở đường cho đúng 1 luồng đã được kiểm soát (đăng
--   bài Bảng tin loại 'announcement') là đủ, không mở rộng thêm gì khác.
--
--   Xử lý ngoại lệ giao diện (Graceful Degradation): notify_push đã SẴN
--   CÓ khối `exception when others then raise warning` bọc quanh
--   net.http_post — nghĩa là nếu bước gửi push thật sự lỗi (API push sập,
--   timeout...) thì bài viết Bảng tin vẫn được lưu bình thường, không bị
--   chặn. Vấn đề chỉ nằm ở bước GỌI hàm (permission denied), không phải ở
--   logic gửi push — nên chỉ cần vá đúng chỗ SECURITY DEFINER này là đủ,
--   không cần thêm try/catch nào khác.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.trg_notify_new_feed_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.post_type = 'announcement' then
    perform public.notify_push(
      '📢 ' || coalesce(new.title, 'Thông báo mới'),
      left(coalesce(new.body, ''), 120),
      '/company-feed/' || new.id::text
    );
  end if;
  return new;
end;
$function$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609091400_fix_permission_denied_notify_push_bang_tin', 'completed', now(),
  'trg_notify_new_feed_post doi sang SECURITY DEFINER (cung chu postgres voi notify_push) de het loi "permission denied for function notify_push" khi dang bai Bang tin. KHONG grant execute notify_push cho authenticated de tranh lo hong spam push tuy y.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
