# Danh sách trường học — đặc tả tìm kiếm và dropdown

## Nguồn dữ liệu

- File: `Danh_sach_truong hoc.xlsx`
- Sheet: `Danh sách khách hàng`
- Tổng số bản ghi nhận được: **92** điểm nhận (không tính hàng tiêu đề và hàng tổng)
- Trường dữ liệu nguồn: mã khách hàng, tên khách hàng, địa chỉ, mã số thuế/CCCD chủ hộ.

## Mục tiêu giao diện

Trong luồng tạo đơn trường học, người dùng không phải kéo qua danh sách dài. Ô đầu tiên là:

**Tìm trường hoặc điểm giao**

Cho phép tìm bằng:

- Mã khách hàng: `HC 5`, `TĐH`, `PH 1`…
- Tên đầy đủ hoặc một phần tên: `Hoa Cúc`, `Tân Đông Hiệp`…
- Tên không dấu: `hoa cuc`, `tan dong hiep`…
- Tên viết tắt: `LQD`, `VPHU`, `TQT`…
- Cơ sở hoặc khối: `cơ sở 2`, `khối 1 2 3`…
- Địa bàn: `Dĩ An`, `Lái Thiêu`, `Gò Vấp`…

## Nội dung mỗi lựa chọn

Mỗi dòng dropdown hiển thị:

1. Tên trường/đơn vị — chữ lớn.
2. Cơ sở hoặc khối — nhãn màu rõ ràng.
3. Mã khách hàng.
4. Địa chỉ rút gọn.
5. Nhãn `Đã đặt gần đây` nếu có lịch sử.

Không hiển thị mã số thuế cho nhân viên sản xuất, kho hoặc vận tải. Mã số thuế chỉ dành cho Giám đốc và kế toán.

## Sau khi chọn trường

Hệ thống tự điền:

- Tên trường/đơn vị nhận.
- Đúng cơ sở hoặc khối.
- Địa chỉ giao mặc định.
- Tuyến đường/định vị nếu đã xác nhận.
- Người liên hệ gần nhất và số điện thoại nếu có.
- Danh sách bánh thường đặt hoặc đơn gần nhất.

Người tạo vẫn được phép chọn **Địa chỉ khác cho đơn này** mà không sửa địa chỉ chuẩn của trường.

## Quy tắc dữ liệu

- Một mã khách hàng là một điểm lựa chọn riêng.
- Các cơ sở dùng chung mã số thuế vẫn phải tách điểm giao.
- Một đơn vị mẹ có thể có nhiều cơ sở hoặc nhiều khối.
- Không dùng mã số thuế làm khóa duy nhất cho điểm giao.
- Tên không dấu và từ khóa tìm kiếm được sinh tự động.
- Cho phép thêm tên thường gọi/tên cũ làm bí danh.
- Nếu không tìm thấy, có nút **Thêm điểm trường mới**; bản ghi mới cần người có quyền duyệt trước khi trở thành dữ liệu dùng chung.

## Các nhóm trùng mã số thuế cần giữ tách điểm giao

- Hoa Mai 5: hai mã khách hàng/tên gọi trong dữ liệu.
- Hoa Cúc 5: công đoàn, trường chính và cơ sở 2.
- Pétrus Ký: cơ sở 1, cơ sở 2 và cơ sở mở rộng.
- Hoa Cúc 10: cơ sở chính và cơ sở 2.
- Hoa Cúc 9: cơ sở chính và cơ sở 2.
- Lê Thị Trung: trường chung, khối 1–2–3 và khối 4–5.

## Bản ghi cần kiểm tra

- Có 1 bản ghi thiếu địa chỉ: `BẾP NGHĨA (TRƯỜNG HỌC)`.
- Có 2 bản ghi thiếu mã số thuế: `BẾP NGHĨA (TRƯỜNG HỌC)` và `CÔNG ĐOÀN CƠ SỞ TRƯỜNG MẦM NON HOA CÚC 6`.
- Danh sách có cả công đoàn, bếp nội bộ và doanh nghiệp; cần gắn `loại điểm nhận` thay vì mặc định tất cả là trường học.
- Một số địa chỉ dùng địa giới mới `TP Hồ Chí Minh`, một số vẫn ghi `Bình Dương/Thuận An/Thủ Dầu Một`; cần lưu nguyên văn và chuẩn hóa thêm trường địa bàn riêng.

## Mô hình dữ liệu đề xuất

```text
school_accounts
- id
- customer_code
- legal_name
- tax_code
- account_type
- active

school_delivery_points
- id
- school_account_id
- display_name
- campus_name
- grade_group
- address_original
- address_normalized
- latitude
- longitude
- contact_name
- contact_phone
- active

school_aliases
- id
- delivery_point_id
- alias
- alias_normalized
```

Tách `đơn vị` và `điểm giao` giúp kế toán dùng đúng pháp nhân, trong khi bếp và vận tải chọn đúng cơ sở thực tế.
