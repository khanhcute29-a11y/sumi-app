# Làm giao diện Chấm Công mới — những điều phải biết trước khi gõ dòng đầu tiên

> Dành cho đội đang mockup lại màn hình Chấm Công và sẽ ghép vào hệ thống thật.
> Đọc cùng [`AGENTS.md`](../AGENTS.md). Tệp này nói riêng về Chấm Công.

Cập nhật: 26/08/2026

---

## 0. Hiểu đúng bản chất trước đã

Chấm công **không phải một màn hình hiển thị**. Nó là **đầu vào của bảng lương**.
Mỗi lần nhân viên bấm nút, hệ thống ghi một dòng vào `shift_logs`, và dòng đó
quyết định: giờ công, tiền chuyên cần, số phút đi muộn trong KPI.

Nghĩa là: **một lỗi giao diện ở đây không dừng ở giao diện — nó thành lỗi tiền lương.**

Đã từng xảy ra đúng như vậy. Trước 26/08, màn hình cũ ghi `expected_start` bằng
chính giờ nhân viên bấm vào, và ghi cứng `late_minutes = 0`. Kết quả: **suốt một
thời gian dài hệ thống ghi nhận cả tiệm không ai đi muộn phút nào.** Chỉ số giờ
muộn trong KPI bằng 0 vĩnh viễn. Không ai phát hiện vì màn hình trông vẫn bình thường.

Toàn bộ phần còn lại của tệp này tồn tại để lỗi đó không quay lại.

---

## 1. 🔴 Luật lệ nằm ở DATABASE — giao diện chỉ hỏi, không tự tính

Đây là quy tắc số một. Vi phạm nó là tái hiện đúng lỗi trên.

**Giao diện TUYỆT ĐỐI KHÔNG được tự tính rồi gửi lên:**

| Không được tự tính | Ai tính | Ở đâu |
|---|---|---|
| Số phút đi muộn | Trigger DB | `sumi_tu_tinh_di_muon_tg` trên `shift_logs` |
| Giờ phải có mặt (`expected_start`) | Trigger DB | như trên |
| Ca nào của ai | Hàm DB | `sumi_doi_chieu_cham_cong` |
| Bộ phận của nhân viên | Hàm DB | `sumi_bo_phan_cham_cong` |
| Giờ làm thực (đã trừ nghỉ trưa) | Hàm DB | `sumi_gio_lam_trong_ngay` |

Trigger chạy **BEFORE INSERT** trên `shift_logs`. Nghĩa là dù giao diện gửi lên
`late_minutes` là bao nhiêu, database cũng **ghi đè bằng giá trị đúng**.

**Việc của giao diện chỉ có 2 phần:**
1. Gửi lệnh chấm công lên (giờ bấm, ảnh, chi nhánh).
2. Đọc kết quả database trả về và hiển thị cho đẹp.

Nếu mockup mới có ô "Đi muộn 15 phút" — con số đó phải **đọc từ `late_minutes`
database trả về**, không phải lấy giờ hiện tại trừ giờ ca bằng JavaScript.

---

## 2. `src/lib/chamCong.js` là **tấm gương** của database

Tệp này chứa logic thuần để hiển thị: gom ngày, tính chênh lệch, tóm tắt tháng.
Nó **phản chiếu** logic dưới database chứ không thay thế.

Hàm nguy hiểm nhất:

```js
export function boPhanCuaHoSo(hoSo)   // src/lib/chamCong.js
```

Hàm này **phải khớp từng dòng** với hàm SQL `sumi_bo_phan_cham_cong`. Đã đối chiếu
trên toàn bộ nhân sự thật, không lệch một người nào.

> **Sửa một bên bắt buộc phải sửa bên kia.** Lệch nhau thì màn hình hiện một ca,
> database tính lương theo ca khác. Không ai nhìn ra cho tới kỳ lương.

Ví dụ dễ sai: `role === 'sale'` được xếp vào nhóm **bakery** (bán hàng tại tiệm
làm cùng ca thu ngân và bếp). Nhìn tên tưởng là nhân viên kinh doanh, thực tế
không phải. Đừng "dọn dẹp" cho gọn.

---

## 3. Giờ ca nằm trong BẢNG, không nằm trong code

Bảng `sumi_quy_dinh_ca`. Muốn đổi giờ ca → **sửa dữ liệu trong bảng**, tuyệt đối
không gõ cứng giờ vào JSX.

Giờ ca hiện hành:

| Bộ phận | Ca | Bắt đầu | Mốc phải có mặt | Tan ca |
|---|---|---|---|---|
| Bakery | Sáng | 05:15 | 05:05 | 14:15 |
| Bakery | Chiều | 13:30 | 13:20 | 22:30 |
| Xưởng 41 · Xưởng 42 · Vận tải | — | 06:00 | 05:50 | 15:00 |

**Mốc = giờ bắt đầu trừ 10 phút.** Đến sau mốc là tính muộn. Đây là quy định của
tiệm, không phải chi tiết kỹ thuật — đừng "làm tròn cho đẹp".

**Ngày công chuẩn 9 tiếng. Nghỉ trưa 11:30–12:30 bị trừ** — nhưng trừ theo
**phần giao nhau thật**, không trừ cứng 1 tiếng. Ai làm ca chiều từ 13:30 thì
không dính giờ nghỉ trưa nên không bị trừ gì cả.

---

## 4. Khung nhận ca — chỗ đã từng có lỗ hổng

Một lần chấm thuộc về ca S nếu nó rơi vào khoảng **[mốc(S) − 2 tiếng, tan ca S)**.
Rơi vào nhiều ca thì chọn ca có mốc **gần nhất**.

```
Bakery sáng   mốc 05:05, tan 14:15  ->  khung [03:05, 14:15)
Bakery chiều  mốc 13:20, tan 22:30  ->  khung [11:20, 22:30)
Xưởng/Vận tải mốc 05:50, tan 15:00  ->  khung [03:50, 15:00)
```

Bản đầu tôi viết dùng giới hạn ±3 tiếng. Hậu quả: người đi muộn 3–5 tiếng bị coi
là "ngoài khung ca" và ghi nhận **muộn 0 phút** — tức là đi muộn càng nhiều càng
không bị ghi. Đã tìm thấy trường hợp thật trong dữ liệu.

> Nếu giao diện mới **thêm ca** hoặc **đổi giờ ca**, phải kiểm tra lại khung có
> chồng lấn không, và có ai rơi ra ngoài mọi khung không.

---

## 5. Bốn lời gọi API phải giữ nguyên

Giao diện mới thay thế cách hiển thị, nhưng **đường dây nối xuống database phải
giữ y nguyên**. Bốn hàm này nằm trong `src/screens/ShiftsScreen.jsx`:

```js
addShiftCheckin(payload)      // Vào ca
addShiftCheckout(payload)     // Tan ca
addLeaveRequest(payload)      // Xin nghỉ
createApprovalRequest({...})  // -> đẩy vào luồng duyệt của quản lý
```

Đổi tên trường trong payload, bỏ bớt trường, hay gọi thẳng `supabase.from(...)`
thay vì dùng các hàm này → mất dấu vết kiểm toán và có thể lọt qua trigger.

**Ca bổ sung tay bắt buộc giữ nhãn `[BỔ SUNG]`** ở đầu trường `reason`. Đây là
dấu vết phân biệt chấm công thật với chấm bù thủ công. Kế toán dựa vào đó.

**Bảng "Quy định ca" trên màn hình là CHỈ ĐỌC.** Không làm nút cho nhân viên sửa
giờ ca của chính mình.

---

## 6. CSS — 139 class đang dùng tiền tố `cc-`

`src/styles/cham-cong.css` có 139 class, tất cả bắt đầu bằng `cc-`
(`.cc-checkin-btn`, `.cc-cal-grid`, `.cc-deviation-card`…).

Hai lựa chọn, **chọn một, không trộn**:

- **A.** Mockup mới giữ nguyên tiền tố `cc-` → thay hẳn nội dung tệp cũ.
- **B.** Mockup mới dùng tiền tố mới (ví dụ `cc2-`) → giữ song song, xoá tệp cũ
  sau khi đã chuyển hết.

Trộn hai bộ class là đè style lên nhau, và lỗi kiểu này chỉ hiện ra trên điện
thoại thật chứ không hiện trên máy tính.

**Bắt buộc:**
- Dùng `dvh`, **không dùng `vh`** cho chiều cao modal. iPhone tính `vh` theo khung
  lớn nhất (lúc ẩn thanh địa chỉ) nên `90vh` cắt mất nút bấm dưới đáy — đã sửa
  đúng lỗi này trên 8 modal, đừng làm lại.
- Modal có `paddingBottom: 'calc(20px + env(safe-area-inset-bottom))'`.
- Nút chạm tối thiểu **44×44px**. Nhân viên bấm bằng tay dính bột, đứng trong bếp nóng.

---

## 7. Quy trình ghép vào hệ thống — làm theo đúng thứ tự này

Đồng đội đã làm đúng cách này với màn hình "Hôm nay" (`EmployeeOverviewV4`), cứ theo mẫu đó:

**Bước 1 — Dựng riêng, chưa đụng màn hình thật.**
Đặt component mới ở `src/components/shifts/` (hoặc thư mục con mới). Mở bằng
đường dẫn thử `?mockup=cham-cong-v2` để xem trên điện thoại thật. Giai đoạn này
**không sửa `ShiftsScreen.jsx`**.

**Bước 2 — Nối dữ liệu thật, vẫn chưa thay.**
Cắm 4 lời gọi API ở §5 vào. Chấm thử bằng tài khoản thật. Kiểm tra `late_minutes`
database trả về có đúng không.

**Bước 3 — Mới thay màn hình thật.**
Chỉ khi bước 2 đã chạy đúng. Đây là lúc sửa `ShiftsScreen.jsx` — **báo nhóm trước
khi mở tệp này**, nó 820 dòng và nằm trong danh sách điểm nóng.

Cắt bước 1 và 2 để "làm cho nhanh" là cách chắc chắn nhất để hỏng chấm công của
cả tiệm trong một ngày làm việc.

---

## 8. Danh sách kiểm tra trước khi báo xong

Chấm công là thứ **không thể sửa sau** — nhân viên đã về, không chấm lại được.
Nên phần kiểm tra này nghiêm hơn các màn hình khác.

**Thử bằng tài khoản thật của từng bộ phận** (không chỉ tài khoản giám đốc —
giám đốc thấy mọi thứ nên không lộ lỗi phân quyền):

- [ ] Bakery **ca sáng** — chấm trước mốc 05:05 → không muộn
- [ ] Bakery **ca sáng** — chấm sau mốc → muộn đúng số phút
- [ ] Bakery **ca chiều** — chấm 13:15 → **không được báo muộn** (mốc là 13:20)
- [ ] **Xưởng 41 / 42** — mốc 05:50
- [ ] **Vận tải** — mốc 05:50
- [ ] **Giám đốc / kế toán** — bộ phận trả về `null`, màn hình **không được vỡ**,
      phải hiện trạng thái "không theo ca cố định"

**Kiểm tra số, không kiểm tra bằng mắt:**

- [ ] Sau khi chấm thử, mở database xem `shift_logs`: `expected_start` và
      `late_minutes` có đúng không — **đây là lỗi cũ, phải xác nhận bằng số**
- [ ] Giờ làm thực đã trừ đúng phần giao với 11:30–12:30
- [ ] Ca bổ sung tay vẫn còn nhãn `[BỔ SUNG]`
- [ ] Tiền chuyên cần tính đúng: 0 lỗi 500K · 1–2 lỗi 300K · 3 lỗi 100K · trên 3 lỗi 0đ

**Trên thiết bị thật:**

- [ ] iPhone — nút dưới đáy modal **không bị cắt**
- [ ] Android APK
- [ ] Chuông và thông báo nền **vẫn kêu** sau thay đổi

**Cuối cùng:**

- [ ] `npm run build` sạch
- [ ] Không sửa/xoá dữ liệu `shift_logs` cũ — lịch sử chấm công là chứng từ

---

## 9. Nếu cần đổi luật chấm công (chứ không chỉ đổi giao diện)

Đổi giờ ca, đổi mốc 10 phút, đổi giờ nghỉ trưa, thêm bộ phận mới — **đó là sửa
database, không phải sửa giao diện.** Viết migration mới theo quy ước ở
[`AGENTS.md §5.4`](../AGENTS.md), thử bằng `begin; … rollback;` trước, và
**báo anh Nghĩa duyệt** — vì nó đổi tiền lương của người thật.

Các migration liên quan, đọc trước khi sửa:

```
202608260070_quy_dinh_cham_cong.sql        # bảng quy định ca + trigger tính muộn
202608260080_va_lo_hong_di_muon.sql        # khung nhận ca [mốc − 2h, tan ca)
202608260090_ban_hang_theo_ca_bakery.sql   # xếp 'sale' vào nhóm bakery
```
