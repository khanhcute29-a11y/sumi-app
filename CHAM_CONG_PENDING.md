# CHẤM CÔNG — trạng thái tạm nghỉ 26/08/2026, 10:15

> Nhánh làm việc: **`feature/cham-cong-mockup`** · Không gộp vào `main` cho tới khi anh Nghĩa duyệt.

---

## ⚠️ ĐỌC TRƯỚC — phần đã nằm trên `main` rồi

Ba việc hôm nay **đã đẩy lên `main` và đã lên sóng** (đẩy sau mỗi lần anh duyệt, trước khi có yêu cầu tách nhánh):

| Commit | Nội dung |
|---|---|
| `83e29cf` | Hiện tồn kho khi tick "Bánh có sẵn" |
| `3a9a818` | Sửa đơn: phân quyền + giới hạn 1 giờ + đối chiếu kho |
| `007aaf6` | Dựng lại giao diện Chấm Công theo mockup |
| `37b4b07` | Quy định chấm công theo bộ phận (trigger dưới database) |

**Không cần rút lại** — anh Vo Dang Khanh đã merge bình thường suốt sáng nay và trang web đang chạy tốt. Nhánh riêng này áp dụng cho **những việc từ giờ trở đi**.

Ba migration đã chạy trên database thật, **không thể "để dành" như code**: `202608260050`, `202608260060`, `202608260070`.

---

## 1. BỘ QUY TẮC THỜI GIAN ĐANG ÁP DỤNG

### Giờ ca theo bộ phận

| Bộ phận | Vào ca | **Mốc phải có mặt** | Tan ca |
|---|---|---|---|
| Xưởng 41 · Xưởng 42 · Vận tải | 06:00 | **05:50** | 15:00 |
| Bakery — ca sáng | 05:15 | **05:05** | 14:15 |
| Bakery — ca chiều | 13:30 | **13:20** | 22:30 |

*Bakery = Thu ngân + Bếp lạnh + Bếp nóng.*

### Các quy tắc

- **Ca 9 tiếng CÓ MẶT** = 8 tiếng làm + 1 tiếng nghỉ trưa.
- **Nghỉ trưa cố định 11:30 – 12:30.** Giờ làm thực tế = (giờ ra − giờ vào) − **phần giao nhau** với khung này.
  → Ca sáng trừ đủ 1 tiếng. **Ca chiều 13:30–22:30 trừ 0** vì không hề đi qua khung nghỉ trưa — trừ 1 tiếng của người không nghỉ trưa là tính thiếu công cho họ.
- **Phải có mặt trước giờ vào ca ít nhất 10 phút.** Muộn hơn mốc đó là **Đi muộn**.
  → Số phút muộn **đếm từ mốc**, không phải từ giờ vào ca. Ca 6h, vào lúc 6h00 = **muộn 10 phút**.
- **Trễ quá 15 phút** → tính **một lỗi** theo Bảng vi phạm.
- **Tiền chuyên cần**: 0 lỗi 500K · 1–2 lỗi 300K · 3 lỗi 100K · >3 lỗi 0đ.

### Ba trường hợp KHÔNG tính đi muộn

1. Bộ phận không theo ca cố định (Giám đốc, kế toán, bán hàng, kho).
2. Chấm công lệch **quá 3 tiếng** so với mọi mốc → "ngoài khung ca".
3. Ca **bổ sung** (quên chấm, nhập bù) — đánh dấu `[BỔ SUNG]`, trigger bỏ qua vì giờ ghi trong đó là lúc bấm nút chứ không phải giờ tới thật.

> 🔧 **Đổi giờ giấc không cần lập trình lại:** bảng `sumi_quy_dinh_ca` trong database. Sửa `gio_bat_dau`, `so_gio_chuan`, `phut_den_som_toi_thieu` là cả hệ thống đổi theo.

---

## 2. TRẠNG THÁI KIỂM THỬ — thật sự đã thử tới đâu

### ✅ Đã kiểm chứng bằng máy

| Nội dung | Kết quả |
|---|---|
| Quy định chấm công dưới database | **25/25** (chạy trên bản thật rồi huỷ) |
| Tầng tính toán phía giao diện | **39/39** |
| Đối chiếu chéo JS ↔ SQL cách chia bộ phận, trên 30 hồ sơ thật | **30/30 khớp** |
| Chốt chặn ca bổ sung | **2/2** |
| Sửa đơn: phân quyền + giới hạn 1 giờ + kho | **28/28** (gồm 4 kịch bản tấn công) |
| Bánh có sẵn: toàn tuyến | **13/13** |
| Giao diện 3 góc nhìn, máy tính + điện thoại | Đã xem tận mắt, không tràn ngang, không nút nào dưới 44px |
| Bản deploy | Đã lên sóng, bundle có `sumi_quy_dinh_ca` |

Bài đáng giá nhất: **app gửi lên giá trị sai (05:58 / 0 phút) → database tự sửa thành 06:00 / muộn 8 phút.**

### ❌ CHƯA kiểm chứng — phải làm khi quay lại

**Toàn bộ verify của tôi là qua dữ liệu giả và gọi thẳng database. Chưa ai đăng nhập bằng tài khoản thật rồi bấm nút.** Tôi không có mật khẩu nhân viên nên không tự thử được.

Cụ thể **chưa test lần nào**:

- [ ] Bấm **"Bắt đầu ca"** thật → xem trigger có điền đúng giờ chuẩn + số phút muộn không
- [ ] **Chụp ảnh xác nhận** (bắt buộc mới lưu được) và **GPS**
- [ ] Bấm **"Kết thúc ca"** → giờ làm thực tế có trừ đúng nghỉ trưa không
- [ ] **"Xin nghỉ / Báo muộn"**
- [ ] **"Bổ sung ca đã làm"** → xác nhận KHÔNG bị tính muộn oan
- [ ] **Hàng đợi offline** (tắt mạng rồi chấm công)
- [ ] Xem trên **điện thoại thật** (tôi chỉ giả lập kích thước màn hình)
- [ ] Ba góc nhìn với **tài khoản thật**: nhân viên / bếp trưởng / giám đốc

### 🐛 Lỗi đang mở

Không có lỗi nào tôi biết mà chưa sửa. Nhưng có **rủi ro chưa xác minh** ở danh sách trên — chưa bấm thật thì chưa dám nói là chạy tốt.

---

## 3. VIỆC CẦN LÀM — xếp theo mức gấp

### 🔴 Gấp

- [ ] **Kho mã đang CÔNG KHAI.** `github.com/khanhcute29-a11y/sumi-app` ai trên Internet cũng đọc được (đã kiểm chứng: API trả 200 khi không đăng nhập).
  → GitHub → Settings → General → Danger Zone → **Change visibility → Private**.
  → Sau đó rà lịch sử git xem đã lỡ đẩy gì nhạy cảm chưa.
- [ ] **Hàng rào `read shift_logs` cho MỌI nhân viên đã duyệt đọc toàn bộ chấm công cả tiệm.** Việc phân vai ở giao diện chỉ là hiển thị — ai biết dùng API vẫn xem được lương giờ của người khác. Muốn khoá thật phải sửa RLS.

### 🟡 Cần làm sớm

- [ ] **21/25 hồ sơ chưa gán `station`** → hệ thống đang suy ca từ chức danh. Gán khâu cho từng người thì chính xác hơn.
- [ ] **Kho thành phẩm đang trống (tồn = 0)** → đơn "Bánh có sẵn" vẫn bị chặn. Đó là đúng, không phải lỗi. Nhập hàng ở **Kho Hàng → Bánh thành phẩm → Điều chỉnh tồn kho**.
- [ ] Anh Võ Đăng Khánh mở lại app một lần để máy đăng ký lại khoá push mới.

### 🟢 Ghi nhớ

- Chỉ số **"giờ đi muộn" trong KPI từ nay sẽ khác 0**. Đó là nó **bắt đầu chạy đúng**, không phải lỗi mới. Trước đây luôn bằng 0 vì màn hình ghi cứng `late_minutes = 0`.
- Dữ liệu chấm công **trước 26/08 không có mốc để đối chiếu** — vĩnh viễn không tính lại được.
- **Chưa sửa được tên/SĐT khách** trong màn hình sửa đơn (cố ý: khách dùng chung nhiều đơn).
- Đơn **đã hoàn thành/đã huỷ** không sửa được kể cả Giám đốc (cố ý: tránh làm sai tồn kho và doanh thu đã chốt).

---

## 4. TỆP ĐỐI CHIẾU

| Tệp | Nội dung | Trạng thái |
|---|---|---|
| `bang_cham_luong.md` | 24 trang chuyển từ Excel: 22 bảng lương cá nhân + BẢNG VI PHẠM + NỘI QUY TÓM TẮT | 🔒 **Đã chặn khỏi git** — chỉ nằm ở máy anh |
| `C:\Users\Admin\Downloads\bang luoing moi nhat 2026.xlsx` | File Excel gốc | Ngoài dự án |
| `CURRENT_STATUS.md` | Nhật ký toàn dự án | 🔒 Đã chặn khỏi git |
| `CHAM_CONG_PENDING.md` | File này | Trong nhánh riêng |

> 🔒 **`bang_cham_luong.md` chứa lương, mã BHXH và thực lĩnh của 22 người có tên thật.** Vì kho mã đang công khai nên tôi đã chặn nó khỏi git (`.gitignore`). **Đừng gỡ dòng chặn đó** cho tới khi kho được chuyển sang riêng tư.

### Những gì lấy được từ file lương, dùng để nối vào chấm công

| Mục trong bảng lương | Lấy từ chấm công |
|---|---|
| Ngày công TT | Số ngày có chấm vào |
| Lương ngày = LCB / 26 × TT | Suy ra từ ngày công |
| Cơm = ngày TT × 30.000đ | Số ngày công |
| Số giờ tăng ca (×1.5) | Phút OT sau giờ tan ca |
| Chuyên cần | Số lỗi (gồm lỗi trễ >15 phút) |

---

## 5. BẢN ĐỒ MÃ NGUỒN

| File | Vai trò |
|---|---|
| `supabase/migrations/202608260070_quy_dinh_cham_cong.sql` | **Nguồn sự thật.** Bảng quy định ca, nhận diện bộ phận, trigger tự tính muộn, hàm tính giờ làm |
| `src/lib/chamCong.js` | Đọc lại quy định để vẽ màn hình. **Không tự tính muộn** — lấy `late_minutes` do database ghi |
| `src/screens/ShiftsScreen.jsx` | Màn hình chính, chọn góc nhìn theo vai trò, giữ nguyên các modal cũ |
| `src/components/shifts/ChamCongNhanVien.jsx` | Góc nhìn nhân viên |
| `src/components/shifts/ChamCongQuanLy.jsx` | Góc nhìn bếp trưởng / giám đốc |
| `src/styles/cham-cong.css` | Giao diện, tiền tố `cc-` |

> ⚠️ **Nguyên tắc phải giữ:** quyền và con số quyết ở **database**. Giao diện chỉ đọc lại. Cả bốn lỗi lớn tìm ra hôm nay đều có chung một gốc: để phía trình duyệt tự quyết.

**Không được đụng vào** (đang chạy ổn định): `sound.js` · `toast.js` · `useOrderNotifications.js` · `deepLink.js` · `push.js` · `sw.js` · `queries.js` · `kpi.js` · `WeeklyScheduleSection.jsx` · `KpiScreen.jsx` · `vercel.json` · `public/version.json`

---

## 6. KHI QUAY LẠI — làm theo thứ tự này

```bash
cd "D:\SUMI APP\sumi-app"; git fetch origin; git status -sb; git log --oneline main..origin/main
```

Có commit mới của đồng đội thì **gộp `main` vào nhánh mình**, không làm ngược lại:

```bash
git checkout feature/cham-cong-mockup; git merge origin/main
```

Sau khi gộp, kiểm tra tính năng của mình còn sống:

```bash
grep -c "sumi_quy_dinh_ca" src/screens/ShiftsScreen.jsx; grep -c "boPhanCuaHoSo" src/lib/chamCong.js; grep -c "cc-today-card" src/components/shifts/ChamCongNhanVien.jsx
```

**Tuyệt đối không `git push --force`.**
