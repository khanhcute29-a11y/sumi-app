# Bàn giao: Trợ lý AI "Gen" (Gemini)

> Cập nhật: 2026-09-25 · Trạng thái: **đã triển khai xong trên bản thật** (sumibakery.shop).

## 0. TL;DR
Toàn bộ tính năng Trợ lý Gen **đã live** trên app chính. Deploy là **liên tục**:
push lên nhánh `main` → Vercel tự build & deploy. Không có bước "đưa lên app" thủ
công nào cho phần code. Chỉ có **2 thứ cần làm tay** khi có thay đổi tương ứng:
Edge Function Supabase và các thay đổi Database (SQL). Xem mục 3 & 4.

---

## 1. Kiến trúc — cái gì nằm ở đâu
| Thành phần | Nơi ở | Ghi chú |
|---|---|---|
| App (Vite + React) | GitHub `khanhcute29-a11y/sumi-app`, nhánh `main` | Push `main` = auto-deploy |
| Hosting | Vercel — project **`sumi-app-zyjk`**, team **`mon-sumi`** → **sumibakery.shop** | ⚠️ Xem mục 6 (quyền truy cập) |
| Backend dữ liệu | **Supabase** `rcmrfwjasrjfopbgdsbm` | Postgres + RLS + Storage + Realtime |
| "Bộ não" AI | **Supabase Edge Function `ai-copilot`** | Gọi Gemini bằng secret `GOOGLE_GENAI_API_KEY` |
| Fallback AI (cũ) | Serverless Vercel `api/ai-copilot.js` | Chỉ dùng khi edge lỗi; còn khóa hardcode (xem mục 7) |

**Luồng AI:** client gọi `supabase.functions.invoke('ai-copilot')` TRƯỚC → nếu lỗi
mới quay về `/api/ai-copilot` (Vercel) → dev mới dùng `VITE_GEMINI_API_KEY`.

---

## 2. Bản đồ file Gen (khi cần sửa)
- `src/lib/geminiCopilot.js` — lõi client: gọi AI, TTS, khai báo tool (bản dev/fallback), các `execute*` thực thi tool, timeout.
- `src/lib/genDataQuery.js` — công cụ "tự truy vấn dữ liệu" + bản đồ 12 bảng, khóa cột theo vai trò.
- `src/lib/genAppGuide.js` — "bách khoa toàn thư" chỉ đường trong app.
- `src/components/ai/GenCopilotModal.jsx` — khung chat + thẻ xác nhận 2 bước + render kết quả.
- `src/components/ai/GenVoiceTaskAlert.jsx` — popup nhận việc / tin nhắn (Gen đọc to).
- `src/components/ai/GenFloatingButton.jsx` — nút nổi mở Gen.
- `src/App.jsx` — mount Gen (bọc `ErrorBoundary`), handler realtime `task_assigned`/`gen_message`.
- `api/ai-copilot.js` — serverless Gemini (fallback Vercel).
- `supabase/functions/ai-copilot/index.ts` — **Edge Function (đường chính)**.

> QUAN TRỌNG: khai báo tool nằm **song song 3 nơi** (edge `index.ts`, `api/ai-copilot.js`,
> và `geminiCopilot.js`). Khi thêm/sửa tool phải cập nhật cả 3 để đồng bộ.

---

## 3. Cách deploy / bảo trì
**a) Code app (React + `api/`):** chỉ cần
```bash
git push origin main
```
→ Vercel tự build & deploy sumibakery.shop (~1–2 phút). App là PWA → sau deploy
nên đóng hẳn app/tab rồi mở lại để lấy bản mới.

**b) Edge Function `ai-copilot`** (khi sửa `supabase/functions/ai-copilot/index.ts`):
```bash
supabase functions deploy ai-copilot --project-ref rcmrfwjasrjfopbgdsbm
```
(cần Supabase CLI đã đăng nhập + link đúng project.)

---

## 4. Thay đổi Database đã áp lên PROD bằng tay (cần lưu vết / tái lập)
3 đoạn SQL dưới đây **đã chạy trực tiếp** trên Supabase SQL Editor (chưa thành file
migration). Nếu dựng môi trường mới hoặc muốn versioned → nên đưa vào
`supabase/migrations/`. Tất cả idempotent-safe để chạy lại.

**4.1 — Cấp SELECT cột an toàn cho `orders`/`order_items`** (để Gen đọc đơn trực
tiếp; cột tiền vẫn chỉ qua RPC):
```sql
GRANT SELECT (id, order_code, status, status_v2, order_type, address, required_at,
  delivery_date, delivery_time, created_at, completed_at, customer_id,
  kitchen_staff_name, shipper_staff_name, note, channel) ON public.orders TO authenticated;
GRANT SELECT (id, order_id, name, name_snapshot, qty, quantity, size, unit,
  specification, category, candle, content) ON public.order_items TO authenticated;
```

**4.2 — Hàm gửi tin nhắn AI→nhân viên** `gen_send_message` (SECURITY DEFINER, chặn
quyền server-side, chèn notification `gen_message`):
```sql
create or replace function public.gen_send_message(p_to_profile_id uuid, p_content text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_from text; v_ok boolean;
begin
  select exists (select 1 from profiles where id = auth.uid()
    and (role = any (array['owner','admin','accountant','deputy_director_x41','deputy_director_x42'])
         or extra_roles && array['owner','admin','accountant','deputy_director_x41','deputy_director_x42']))
  into v_ok;
  if not v_ok then raise exception 'Khong du quyen gui tin nhan'; end if;
  if coalesce(trim(p_content),'') = '' then raise exception 'Noi dung tin nhan rong'; end if;
  select full_name into v_from from profiles where id = auth.uid();
  insert into notifications (event_key, recipient_profile_id, notification_type, severity,
    sound_key, title, body, entity_type, entity_id, deep_link)
  values ('gen_msg:'||gen_random_uuid(), p_to_profile_id, 'gen_message', 'urgent', 'ting',
    coalesce(v_from,'Sếp')||' nhắn', p_content, 'message', p_to_profile_id, '')
  returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.gen_send_message(uuid, text) to authenticated;
```

**4.3 — Bảng bộ nhớ hội thoại** `gen_memory` (RLS: mỗi người chỉ đọc/ghi của mình):
```sql
create table if not exists public.gen_memory (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  noi_dung text not null,
  created_at timestamptz not null default now()
);
alter table public.gen_memory enable row level security;
drop policy if exists "gen_memory self select" on public.gen_memory;
drop policy if exists "gen_memory self insert" on public.gen_memory;
drop policy if exists "gen_memory self delete" on public.gen_memory;
create policy "gen_memory self select" on public.gen_memory for select to authenticated using (profile_id = auth.uid());
create policy "gen_memory self insert" on public.gen_memory for insert to authenticated with check (profile_id = auth.uid());
create policy "gen_memory self delete" on public.gen_memory for delete to authenticated using (profile_id = auth.uid());
grant select, insert, delete on public.gen_memory to authenticated;
create index if not exists gen_memory_profile_idx on public.gen_memory(profile_id, created_at desc);
```

> Các RPC nghiệp vụ khác mà Gen dùng (`sumi_nhan_viec`, `sumi_bao_xong_viec`,
> `sumi_tu_choi_viec`, `sumi_vat_tu_nhap`, `sumi_vat_tu_xuat`, `create_general_task`,
> `create_order_v2`, `submit_expense_claim`, `submit_salary_advance`, `review_*`...)
> đã có sẵn từ app — Gen chỉ tái dùng, không cần tạo mới.

---

## 5. Secrets / Env
- **Supabase secret `GOOGLE_GENAI_API_KEY`** (đường chính): đã đặt sẵn, Edge Function
  `ai-copilot` + các function voice dùng chung.
- **Vercel env `GEMINI_API_KEY`** (fallback `/api`): thuộc team `mon-sumi`.
- **`VITE_GEMINI_API_KEY`**: chỉ để chạy `vite dev` cục bộ, KHÔNG đặt trên Vercel.

---

## 6. ⚠️ Rủi ro cần lưu ý
- **Quyền Vercel `mon-sumi`:** project chạy sumibakery.shop nằm ở team Vercel
  `mon-sumi` — hiện **chưa xác định tài khoản chủ** (khác `khanhcute29-4617` và
  `buitrongnghia1409-star`/`buinghia`). Cần tìm lại tài khoản này để quản lý env
  / rollback / domain. Push `main` vẫn auto-deploy bình thường vì gắn qua GitHub.
- **App khác dễ nhầm:** `buinghia/sumi-bakery-erp` (domain `admin.mooncakesumibakery.shop`,
  nhánh `erp-system`) là **app khác**, KHÔNG phải app Gen này.

---

## 7. TODO còn treo (chưa làm)
- [ ] **Gỡ khóa hardcode Gemini** trong `api/ai-copilot.js` (biến `DEFAULT_KEY_B64`).
  Giờ an toàn để gỡ vì đường chính là Edge Function Supabase. Cần đặt
  `GEMINI_API_KEY` trên Vercel `mon-sumi` trước (hoặc bỏ hẳn fallback `/api`).
- [ ] Đưa 3 SQL ở mục 4 thành file trong `supabase/migrations/` (versioned).
- [ ] Test cross-device: giao việc / nhắn tin AI→nhân viên (2 máy), bộ nhớ hội thoại.

---

## 8. Kiểm thử nhanh (đăng nhập theo vai trò)
- Giám đốc: "doanh thu tuần này", "đơn nào trễ hẹn", "nhắn cho [tên] rằng...".
- Nhân viên: "nhận việc [tên]", "báo xong việc [tên]", "chấm công ở đâu".
- Thủ kho: "nhập 10 khay bơ", "xuất 3 thùng đường".
- Phân quyền: nhân viên tuyến dưới hỏi giá/doanh thu → Gen từ chối (đúng).
