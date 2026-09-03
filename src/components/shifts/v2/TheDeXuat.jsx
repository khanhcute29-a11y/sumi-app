import React from 'react';
import { chuCaiDau } from './dungChung';
import { TRANG_THAI_DUYET } from '../../../lib/trangThaiDuyet';

// Một thẻ đơn từ / đề xuất — dựng theo ảnh mẫu anh Nghĩa gửi.
//
// Dùng CHUNG cho cả ba màn hình: nhân viên xem đơn của mình, quản lý duyệt cấp
// 1, giám đốc duyệt cấp 2. Một thẻ duy nhất nghĩa là ba cấp luôn nhìn thấy y
// hệt nhau — đúng yêu cầu "nhất quán thông tin các cấp". Sửa cách hiển thị ở
// đây là cả ba nơi đổi theo, không sợ nơi này hiện khác nơi kia.

export const LOAI_DON = {
  leave_request: { ten: 'Đơn xin nghỉ phép', icon: '🏖' },
  shift_recheck: { ten: 'Đơn xin chấm công lại', icon: '⏱' },
  task_exemption: { ten: 'Đơn xin miễn công việc', icon: '📋' },
  order_edit: { ten: 'Đơn xin sửa đơn hàng', icon: '✏️' },
  order_cancel: { ten: 'Đơn xin huỷ đơn hàng', icon: '🚫' },
  order_delete: { ten: 'Đơn xin xoá đơn hàng', icon: '🗑' },
};

export const PHAM_VI_NGHI = {
  ca_ngay: 'Cả ngày',
  nua_ca_dau: 'Nửa ca đầu',
  nua_ca_sau: 'Nửa ca sau',
};

export const LOAI_NGHI = {
  phep_nam: 'Phép năm',
  khong_luong: 'Nghỉ không lương',
  om_dau: 'Nghỉ ốm',
  viec_rieng: 'Việc riêng',
};

// Màu + icon KHÔNG còn định nghĩa tại chỗ nữa: dùng chung lib/trangThaiDuyet
// để mọi màn hình duyệt trong app hiện y hệt nhau (xanh ✅ = duyệt, đỏ ❌ =
// từ chối). Trước đây chỗ này dùng ⛔ còn nơi khác dùng ❌ — người không đọc
// được chữ phải đoán xem hai hình đó có cùng nghĩa không.
const TRANG_THAI = TRANG_THAI_DUYET;

function ngayVN(d) {
  if (!d) return '';
  const [y, m, ng] = String(d).slice(0, 10).split('-');
  return `${Number(ng)}/${Number(m)}/${y}`;
}

/** Một bậc trong thang duyệt. */
function BacDuyet({ so, ten, trangThai, nguoi, ghiChu }) {
  const tt = TRANG_THAI[trangThai] || TRANG_THAI.pending;
  return (
    <div className="cc2-bac">
      <span className="cc2-bac-so" style={{ background: tt.nen, color: tt.mau }}>{so}</span>
      <span className="cc2-bac-chu">
        <b>Cấp {so} — {ten}</b>
        <small style={{ color: tt.mau }}>
          {tt.icon} {trangThai === 'pending' ? 'Đang chờ' : tt.chu.toLowerCase()}
          {nguoi ? `: ${nguoi}` : ''}
        </small>
        {ghiChu && <small style={{ color: 'var(--cc2-muted)' }}>💬 {ghiChu}</small>}
      </span>
    </div>
  );
}

export default function TheDeXuat({
  don, hienNguoiGui = true, dangXuLy = false, onDongY, onTuChoi,
}) {
  const loai = LOAI_DON[don.type] || { ten: don.type, icon: '📄' };
  const tt = TRANG_THAI[don.status] || TRANG_THAI.pending;

  // Dòng tóm tắt: phạm vi · ngày · lý do — đúng thứ tự trong ảnh mẫu.
  const tomTat = [];
  if (don.leave_scope) tomTat.push(PHAM_VI_NGHI[don.leave_scope] || don.leave_scope);
  if (don.leave_date) {
    tomTat.push(don.leave_to_date && don.leave_to_date !== don.leave_date
      ? `${ngayVN(don.leave_date)} – ${ngayVN(don.leave_to_date)}`
      : ngayVN(don.leave_date));
  }
  if (don.order_code) tomTat.push(`Đơn ${don.order_code}`);
  if (don.leave_kind) tomTat.push(`lý do: ${LOAI_NGHI[don.leave_kind] || don.leave_kind}`);

  const cap1 = don.cap1_status || 'pending';
  const cap2 = don.cap2_status || (cap1 === 'approved' ? 'pending' : null);

  return (
    <article className="cc2-don" style={{ borderLeftColor: tt.vien }}>
      <h3 className="cc2-don-ten">{loai.icon} {loai.ten}</h3>

      {tomTat.length > 0 && (
        <div className="cc2-don-dong">🕐 {tomTat.join(' · ')}</div>
      )}

      {don.reason && (
        <div className="cc2-don-dong noi-dung">❗ {don.reason}</div>
      )}

      {don.photo_url && (
        <img src={don.photo_url} alt="Ảnh kèm đơn" loading="lazy" className="cc2-don-anh" />
      )}

      <div className="cc2-don-trangthai" style={{ background: tt.nen, color: tt.mau }}>
        {tt.icon} {tt.chu}
      </div>

      {hienNguoiGui && (
        <div className="cc2-don-nguoi">
          <span className="cc2-staff-face" style={{ width: 30, height: 30, fontSize: 12, fontWeight: 900 }}>
            {chuCaiDau(don.requester_name)}
          </span>
          <span>
            <b>{don.requester_name || 'Không rõ'}</b>
            {don.requester_role ? <small> · {don.requester_role}</small> : null}
          </span>
        </div>
      )}

      {/* Thang duyệt — luôn hiện đủ hai bậc, kể cả bậc chưa tới lượt, để người
          gửi biết đơn của mình đang nằm ở đâu chứ không phải đoán. */}
      <div className="cc2-thang">
        <div className="cc2-thang-nhan">👥 Người duyệt</div>
        <BacDuyet so={1} ten="Quản lý" trangThai={cap1}
          nguoi={don.cap1_name} ghiChu={don.cap1_note} />
        {cap1 !== 'rejected' && (
          <BacDuyet so={2} ten="Giám đốc" trangThai={cap2 || 'pending'}
            nguoi={don.cap2_name} ghiChu={don.cap2_note} />
        )}
      </div>

      {(onDongY || onTuChoi) && don.status === 'pending' && (
        <div className="cc2-dexuat-nut">
          <button className="tuchoi" disabled={dangXuLy} onClick={() => onTuChoi?.(don)}>
            {dangXuLy ? '…' : '❌ Không duyệt'}
          </button>
          <button className="dongy" disabled={dangXuLy} onClick={() => onDongY?.(don)}>
            {dangXuLy ? 'Đang lưu…' : '✅ Duyệt'}
          </button>
        </div>
      )}
    </article>
  );
}
