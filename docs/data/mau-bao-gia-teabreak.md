# Đặc tả báo giá Teabreak

## Nguồn tham khảo

- File: `BG Teabreak SUMI Bakery-nghia.xlsx - BG-BVHP-a Nhân (1).pdf`
- Đây là mẫu dữ liệu cũ. Không sử dụng mã hàng cũ làm căn cứ liên kết sản phẩm.
- Liên kết món bằng tên chuẩn + quy cách; mã mới sẽ bổ sung sau.

## Cấu trúc báo giá

### Thông tin khách hàng và sự kiện

- Đơn vị/khách hàng.
- Người liên hệ.
- Điện thoại, email.
- Địa điểm tổ chức.
- Ngày bắt đầu.
- Giờ cần hoàn thành.
- Số khách (`pax`).
- Ngày tạo và hạn hiệu lực báo giá.

### Các nhóm dòng báo giá

1. Bánh/món Teabreak.
2. Trái cây.
3. Nước uống.
4. Dụng cụ: đĩa, muỗng, ly, khăn giấy.
5. Nhân sự phục vụ.
6. Vận chuyển và setup trưng bày.
7. Dịch vụ hoặc món tùy nhập khác.

### Trường của mỗi dòng

- Nhóm dòng.
- Tên sản phẩm/dịch vụ.
- Đơn vị tính.
- Quy cách.
- Đơn giá.
- Số lượng.
- Thành tiền = đơn giá × số lượng.
- Ghi chú tùy chọn.

## Ví dụ đã đối chiếu

| Tên sản phẩm/dịch vụ | ĐVT | Quy cách | Đơn giá | SL | Thành tiền |
|---|---|---|---:|---:|---:|
| Hamburger bò mini | Cái | 4cm | 15.000 | 55 | 825.000 |
| Bông lan chà bông rong biển | Cái | 4cm | 13.000 | 55 | 715.000 |
| Cream cheese | Cái | 20g | 10.000 | 55 | 550.000 |
| Su kem tròn | Cái | 3cm | 7.000 | 55 | 385.000 |
| Tart trứng | Cái | 5cm | 15.000 | 55 | 825.000 |
| Trái cây chọn đặc biệt | Kg | Dĩa | 200.000 | 3 | 600.000 |
| Trà bí đao | Lít | Pha sẵn | 150.000 | 2 | 300.000 |
| Đĩa, muỗng, ly, khăn giấy | Bộ | Thực tế | 6.000 | 100 | 600.000 |
| Nhân sự | Nhân viên | 5 giờ/người | 300.000 | 1 | 300.000 |
| Vận chuyển + setup trưng bày | Gói | Chuyến | 500.000 | 1 | 500.000 |

- Tổng chưa VAT: 5.600.000đ.
- VAT mẫu cũ: 6% = 336.000đ.
- Tổng gồm VAT: 5.936.000đ.

> Thuế suất phải là dữ liệu cấu hình theo thời điểm và loại hóa đơn, không được viết cố định 6% trong mã nguồn.

## Điều khoản mẫu

- Khách chuẩn bị khu vực setup, bàn ghế và khăn trải bàn; có thể đặt thêm.
- Đặt cọc 60% để chuẩn bị và sản xuất trước 48 giờ.
- Báo giá có hạn hiệu lực.
- Điều khoản được phép sửa theo từng khách hàng trước khi phát hành.

## Quy tắc kiểm tra tự động

- Hạn hiệu lực không được sớm hơn ngày tạo báo giá; nếu sự kiện sau hạn hiệu lực phải cảnh báo rõ.
- Thành tiền từng dòng phải bằng đơn giá × số lượng.
- Tổng chưa VAT bằng tổng các dòng.
- VAT tính từ tổng chưa VAT theo mức được chọn.
- Tổng thanh toán bằng tổng chưa VAT + VAT - giảm giá/phần đã cọc.
- Số tiền bằng chữ sinh tự động.
- Cảnh báo khi tổng số phần ăn quá thấp hoặc quá cao so với số khách.
- Cho phép số lượng mỗi món khác số khách vì một khách có thể dùng nhiều món.

## Quy trình trong webapp

1. Nhập sự kiện và số khách.
2. Chọn món từ menu Teabreak bằng ảnh/tên/quy cách.
3. Thêm trái cây, nước, dụng cụ, nhân sự, vận chuyển/setup.
4. Hệ thống tính tổng và VAT.
5. Lưu nháp hoặc gửi Giám đốc duyệt giá.
6. Xuất PDF/chia sẻ báo giá cho khách.
7. Khi khách chấp nhận, chuyển báo giá thành đơn hàng; giữ nguyên phiên bản giá đã chốt.
8. Tách phiếu sản xuất không có giá cho bếp và phiếu công việc cho setup/vận tải.

## Quyền truy cập

- Giám đốc: xem/sửa giá, giảm giá, thuế, điều khoản và phê duyệt.
- Người tạo báo giá được cấp quyền: nhập khách, món, số lượng và giá trong phạm vi cho phép.
- Bếp/kho/vận tải: không thấy giá; chỉ thấy món, quy cách, số lượng, thời gian và nhiệm vụ.

