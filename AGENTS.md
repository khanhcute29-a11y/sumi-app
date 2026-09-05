# AGENTS.md — Bản đồ hệ thống Sumi Bakery (cho Codex / Claude / người mới)

> **ĐỌC HẾT TỆP NÀY TRƯỚC KHI SỬA BẤT KỲ DÒNG CODE NÀO.**
>
> ⚠️ Tệp `AGENTS.md` ở **thư mục cha** (`../AGENTS.md`) là bản *đặc tả mong muốn* viết từ
> đầu dự án. Nó ghi Next.js 14 + TypeScript + Prisma + Socket.io + Tailwind.
> **Hệ thống thật KHÔNG dùng bất kỳ thứ nào trong số đó.** Tệp này mới là sự thật.
> Khi hai tệp mâu thuẫn, **tệp này thắng**.

Nhánh chính: `main`. Không ghi cứng ngày/commit ở đây — dễ lỗi thời; chạy
`git log -1` nếu cần biết bản đang chạy thật.

---

## 1. Hệ thống thật sự là gì

| Hạng mục | Thực tế | KHÔNG phải |
|---|---|---|
| Khung | **Vite 5 + React 18** (SPA, một trang) | Next.js, App Router, Server Actions |
| Ngôn ngữ | **JavaScript thuần** (`.js` / `.jsx`) | TypeScript |
| CSS | **CSS thường + style inline** | Tailwind, CSS-in-JS |
| Icon | `lucide-react` + `src/components/icons/FrogIcons.jsx` tự vẽ | — |
| Database | **Supabase** (PostgreSQL + RLS) | Prisma, Drizzle |
| Thời gian thực | **Supabase Realtime** (`postgres_changes` + `broadcast`) | Socket.io, WebSocket tự dựng |
| Chạy nền | **Web Push (VAPID)** qua `api/send-push.js` + Service Worker | Firebase |
| Triển khai | **Vercel** → `sumibakery.shop` | — |
| Đóng gói mobile | WebView bọc thành APK Android | React Native |

```bash
npm install
npm run dev
npm run build
```

Biến môi trường (đặt trong `.env.local`, **không bao giờ commit**):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`.

> 🔴 **Kho mã này ĐANG CÔNG KHAI trên Internet.** Tuyệt đối không viết khoá, mật khẩu,
> mã PIN, tên/lương nhân sự, hay mô tả lỗ hổng chưa vá vào bất kỳ tệp nào được commit.

---

## 2. Bản đồ thư mục

```
sumi-app/
├── api/send-push.js              # Hàm serverless Vercel — gửi Web Push
├── public/version.json           # ⚠️ Cổng chặn phiên bản APK (xem §6)
├── supabase/migrations/          # nguồn sự thật của database (xem §5.4 quy ước tên)
└── src/
    ├── App.jsx                   # Định tuyến màn hình + realtime toàn cục
    ├── screens/                  # mỗi tab một tệp
    ├── components/
    │   ├── Messenger/            # 🔒 CHAT — của đồng đội, xem §4
    │   ├── EmployeeDashboard/     # 🔒 Màn hình "Hôm nay" — của đồng đội, xem §4
    │   ├── tasks/v2/             # Phân hệ VIỆC (bản mới, đang dùng)
    │   ├── shifts/               # Phân hệ CHẤM CÔNG
    │   ├── orders/               # Sửa đơn hàng
    │   └── mockups/              # Bản nháp giao diện — KHÔNG phải code chạy thật
    ├── lib/                      # Logic thuần + truy vấn (xem §3)
    ├── styles/                   # cham-cong.css (cc-) · cong-viec.css (cv-)
    └── data/                     # Danh mục tĩnh (schoolCatalog…)
```

**`src/mockups/` và `src/components/mockups/` là bản nháp thiết kế.** Sửa ở đó
không làm thay đổi gì trên ứng dụng thật. Đừng nhầm.

---

## 3. Các tệp `lib/` quan trọng

| Tệp | Vai trò |
|---|---|
| `supabaseClient.js` | **Một client duy nhất cho cả app.** Không tự tạo client thứ hai. |
| `queries.js` (1142 dòng) | Toàn bộ truy vấn đơn hàng/việc. Điểm nóng xung đột — sửa nhỏ, đúng chỗ. |
| `AuthContext.jsx` | Phiên đăng nhập + hồ sơ + vai trò |
| `chamCong.js` | Logic chấm công thuần (không gọi mạng). Phản chiếu hàm SQL `sumi_bo_phan_cham_cong` — **sửa một bên phải sửa bên kia**. |
| `congViec.js` | Logic phân loại / lọc / tính điểm việc, thuần |
| `chat.js` | 🔒 Của đồng đội — xem §4 |
| `sound.js`, `alarmSound.js`, `notificationSound.js` | 🔒 Hệ thống chuông — xem §4 |
| `push.js`, `versionCheck.js` | 🔒 Push nền + cổng chặn phiên bản — xem §4, §6 |
| `permissions.js`, `roles.js` | Bản đồ vai trò phía giao diện |

---

## 4. 🔒 VÙNG CẤM — không sửa nếu không được giao đích danh

Ba hệ thống này đang chạy thật cho 22 nhân sự. Hỏng là cả tiệm mất việc trong ngày.

**A. Chát nội bộ (Messenger)** — do đồng đội phụ trách

```
src/components/Messenger/*        src/lib/chat.js
supabase/migrations/2026082600{95,96,97,98,99}_*chat*.sql
Kênh realtime:  chat-my-rooms-*  ·  chat-room-<id>
Bảng:           chat_rooms · chat_participants · chat_messages
RPC:            get_or_create_dm_room
```

**B. Chuông báo** — `sound.js` / `alarmSound.js` / `notificationSound.js` /
`public/alert.mp3` / `public/task-complete.wav`

Chuông phải nằm **cùng một lần `playOnce`** với tin nhắn toast tương ứng.
Tách ra là chuông kêu hai lần hoặc câm hẳn.

**D. Màn hình "Hôm nay" của nhân viên** — do đồng đội phụ trách (mới, 26/08)

```
src/components/mockups/EmployeeDashboard/EmployeeOverviewV4.jsx
src/components/mockups/EmployeeDashboard/employee-overview-v4.css
src/lib/employeeOverviewV4.js
supabase/migrations/202608260150_staff_violations_rewards_shift_reports.sql
```

`MobileHomeScreen.jsx` **vẫn là file thật được `App.jsx` gọi** cho tab "Hôm nay"
— nó KHÔNG bị thay thế. Bên trong nó tự định tuyến theo vai trò: Giám đốc/Phó GĐ
→ `DirectorHome`, Bếp trưởng → `LeadHome`, nhân viên thường → `EmployeeOverviewV4Inner`
(nhánh này mới là phần "của đồng đội" ở trên). Đừng tưởng `MobileHomeScreen.jsx`
đã chết rồi bỏ qua khi sửa — 2 nhánh Director/Lead vẫn sống trong đúng file đó.
Xem `?mockup=employee-v4` để chạy thử riêng `EmployeeOverviewV4` (không qua vai trò).

**C. Web Push nền** — `src/lib/push.js` · `api/send-push.js` · Service Worker

Đây là thứ khiến điện thoại kêu khi màn hình đã tắt. Không đụng vào luồng đăng ký
subscription.

---

## 5. ⚡ Quy tắc chống xung đột giữa hai AI

### 5.1 Chia lãnh thổ theo TỆP, không theo tính năng

Trước khi bắt đầu, mỗi bên **công bố danh sách tệp mình sẽ chạm** trong nhóm chat.
Không ai sửa tệp ngoài danh sách của mình. Nếu buộc phải chạm tệp của bên kia →
nhắn trước, đợi trả lời.

### 5.2 Điểm nóng — hai bên cùng sửa là chắc chắn xung đột

```
1789 dòng  src/screens/OrdersScreen.jsx
1476 dòng  src/components/OrderV2DetailModal.jsx
1142 dòng  src/lib/queries.js
 820 dòng  src/screens/ShiftsScreen.jsx
      —    src/App.jsx          <- định tuyến, ai thêm màn hình cũng phải sửa
```

Với 5 tệp này: **chỉ một người sửa tại một thời điểm.** Nhắn trước khi mở.

### 5.3 Kênh realtime — mỗi tính năng một tên riêng

Đang dùng, **không đặt trùng**:

```
App/toàn cục : notifications-toast-global · nav-badges-live · orders-notify
Đơn hàng     : orders-list-live · kds-orders-live · shipping-orders-live
               order-comments-<id>
Việc         : cong-viec-v2 · tasks-live · bao-cao-<id>
Khác         : staff-screen-live · company-feed-live · production-logs-live
               notifications-v2-inbox · own-profile-<id>
Chát 🔒      : chat-my-rooms-* · chat-room-<id>
```

Tính năng mới → tên kênh mới, đặt theo mẫu `<tên-tính-năng>-<phiên-bản>`.
**Không bao giờ đăng ký thêm listener vào kênh của người khác** — gỡ nhầm là tắt
realtime của họ.

### 5.4 Migration SQL — quy ước đặt tên bắt buộc

```
supabase/migrations/YYYYMMDDHHmm_mo_ta_ngan.sql
```

- Mỗi người dùng **khoảng số riêng trong ngày** để không đụng số nhau
  (ví dụ: Claude dùng `…00`–`…49`, Codex dùng `…50`–`…99`).
- Mọi migration phải bọc `begin; … commit;` và đặt `set local lock_timeout = '10s';`
- **Không `drop table` / `drop column` / `truncate`** trên database thật. Chỉ thêm, không xoá.
- Thử trước bằng `begin; … rollback;` rồi mới chạy thật.
- Ghi kết quả vào bảng `migration_runs` — xem các migration gần đây làm mẫu.

### 5.5 Git

```bash
git pull --rebase origin main
git checkout -b feature/<ten-tinh-nang>
```

- Không `git push --force` lên `main`.
- Commit nhỏ, thông điệp tiếng Việt không dấu: `fix(cong-viec): ...`
- Trước khi gộp vào `main`: `npm run build` phải chạy sạch.

---

## 6. Ba cái bẫy đã làm sập hệ thống trước đây

**Bẫy 1 — `public/version.json` khoá cả tiệm.**
`force: true` bắt mọi máy phải cập nhật APK mới được dùng. Nếu số `version` ở đây
cao hơn bản APK nhân viên đang cài, **toàn bộ nhân sự bị chặn khỏi ứng dụng.**
Chỉ tăng số này khi APK mới đã thật sự nằm ở `download_url`.

**Bẫy 2 — RLS chặn cả chính mình.**
Nhiều bảng có hàng rào RLS riêng. Viết câu kiểm tra thẳng trong `policy` sẽ chạy
bằng quyền người gọi và trả về rỗng. Phải bọc trong hàm `SECURITY DEFINER` —
xem `sumi_cung_don_vi_voi_toi` trong migration `…0120` làm mẫu.
Ngoài ra: **RLS không chặn `TRUNCATE`** — phải `revoke` riêng.

**Bẫy 3 — quyền hạn phải do DATABASE quyết, không phải trình duyệt.**
Mọi lỗi nghiêm trọng của dự án này đều truy về việc giao diện tự quyết định điều
lẽ ra database phải quyết. Không tin `p_user_id` client gửi lên — dùng `auth.uid()`.
Không đoán vai trò từ cột `profiles.role` (dữ liệu không khớp sơ đồ tổ chức) —
gọi RPC `sumi_vai_tro_cong_viec` / `sumi_quyen_sua_don`.

---

## 7. Danh sách RPC đang dùng (đừng đổi chữ ký)

```
Đơn hàng   create_order_v2 · update_order_v2 · sumi_quyen_sua_don
           request_order_edit_approval · approve_order_edit_request
           mark_order_ready_from_stock · check_finished_goods_stock
           add_order_comment · soft_delete_order_comment
           enqueue_order_operational_alerts

Bếp        accept_order_package · assign_order_package · assign_package_task
           accept_work_package_self · accept_delegate_work_package
           complete_kitchen_work_package_with_proof
           complete_work_package_and_order · approve_work_package_completion

Giao hàng  create_delivery_run_v3 · start_delivery_run_v3 · accept_delivery_run_v2
           accept_delivery_assignment_flexible
           complete_delivery_stop · complete_delivery_assignment

Việc       create_general_task · start_task_v2 · complete_task_v2
           sumi_bao_xong_viec · sumi_duyet_viec · sumi_nhac_nho_viec
           sumi_vai_tro_cong_viec · sumi_danh_sach_khau_viec
           create_recurring_todo · delete_recurring_todo
           set_daily_todo_completion · delete_personal_task

Nhân sự    is_business_director · get_staff_kpi_v2
           submit_expense_claim · submit_salary_advance

Thanh toán / công nợ
           verify_order_payment · record_customer_debt_payment

Chát 🔒    get_or_create_dm_room · create_chat_group · notify_chat_mentions
```

Muốn đổi tham số của một RPC → **báo cả nhóm trước.** Giao diện gọi thẳng bằng tên;
đổi âm thầm là màn hình trắng ngay lập tức.

---

## 8. Quy tắc giao diện (bắt buộc)

- Màu: nền `#FDFBF7` · thẻ `#F7EFE2` · chữ `#2C1D11` / `#8C5A3C` · nút chính `#D96B43`
- Bo góc 8–16px, không góc vuông. Đổ bóng ấm, nhẹ.
- Nút chạm tối thiểu **44×44px** — nhân viên dùng điện thoại, tay dính bột.
- **Dùng `dvh`, không dùng `vh`** cho chiều cao modal. iPhone tính `vh` theo khung
  lớn nhất nên `90vh` cắt mất nút bấm dưới đáy.
- Modal phải có `paddingBottom: 'calc(20px + env(safe-area-inset-bottom))'`.
- Chữ trên màn hình viết tiếng Việt, giọng đời thường — người dùng là thợ bánh,
  không phải kỹ sư. Không hiện mã lỗi kỹ thuật ra màn hình.

---

## 9. Trước khi báo "xong"

1. `npm run build` chạy sạch, không cảnh báo mới.
2. Thử bằng **tài khoản thật của đúng vai trò** đó — không chỉ tài khoản giám đốc.
   Giám đốc thấy mọi thứ nên không phát hiện được lỗi phân quyền.
3. Thử trên **điện thoại thật**, cả iPhone lẫn Android.
4. Kiểm tra chuông và thông báo nền **vẫn kêu** sau thay đổi của mình.
5. Nếu có sửa database: chạy lại truy vấn đối chiếu, dán số liệu thật vào báo cáo.
   Không nói "đã sửa xong" nếu chưa nhìn thấy số.

---

## Agent skills

### Issue tracker

Issues/spec cho sumi-app lưu dạng markdown local dưới `.scratch/<tính-năng>/` —
không dùng GitHub Issues dù repo có remote GitHub thật. Xem
`docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` ở gốc repo. Xem `docs/agents/domain.md`.
