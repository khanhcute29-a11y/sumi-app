import React from 'react';
import { LichSuCham, chuCaiDau, gioThanhChu } from './dungChung';
import StarRateBar from '../../StarRateBar';

// Hộp chi tiết một nhân sự — Quản lý bấm vào người trong danh sách thì mở ra.
// Gồm: giờ vào/ra hôm nay, khu vực ĐÁNH GIÁ SAO, và lịch sử chấm công.
//
// Đánh giá Sao đi qua RPC sumi_dieu_chinh_sao — CÙNG một cổng ghi dùng ở Duyệt
// việc/Đơn hàng, để số sao/ghi chú và cách sửa/xoá nhất quán ở mọi nơi (trước
// đây khối này tự gọi riêng sumi_tang_sao_ca, giới hạn cứng 1..5 sao, khác
// hẳn cách nhập tự do+ghi chú của các luồng còn lại — đã bỏ để đồng bộ).
// Quyền vẫn do DATABASE quyết (quản lý cùng đơn vị hoặc quản lý lương, không
// tự đánh giá chính mình) — màn hình chỉ ẩn nút cho gọn mắt.

export default function ChiTietNhanSuModal({
  nhanSu, cham, logs, danhSachCa, boPhan, thuong = [],
  coTheTangSao, laChinhToi, onClose, onXong,
}) {
  const dev = cham?.chenhLech || null;

  const tongSao = (thuong || []).reduce(
    (s, t) => s + (t.so_sao || Math.round((t.amount || 0) / 1000)), 0);

  return (
    <div className="cc2 cc2-sheet-backdrop" onClick={() => !dangGui && onClose?.()}>
      <div className="cc2-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="cc2-sheet-head">
          <h2>Chấm công cá nhân</h2>
          <button className="cc2-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>

        <div className="cc2-detail-profile">
          <div className="cc2-staff-face">{chuCaiDau(nhanSu?.full_name)}</div>
          <div style={{ minWidth: 0 }}>
            <b>{nhanSu?.full_name || 'Nhân sự'}</b>
            <small>
              {cham?.ca ? `${cham.ca.ten} · ${cham.ca.batDau}–${cham.ca.ketThuc}` : 'Không theo ca cố định'}
              {dev ? ` · ${dev.nhanVao}` : ''}
            </small>
          </div>
        </div>

        <div className="cc2-staff-day">
          <div>
            <small>Giờ vào hôm nay</small>
            <strong>{cham?.vao || '--:--'}</strong>
          </div>
          <div>
            <small>Giờ ra hôm nay</small>
            <strong>{cham?.ra || '--:--'}</strong>
          </div>
          <div>
            <small>Giờ làm thực</small>
            <strong>{gioThanhChu(cham?.soGio)}</strong>
          </div>
          <div>
            <small>Thưởng đã nhận</small>
            <strong>{tongSao ? `${tongSao}⭐` : '—'}</strong>
          </div>
        </div>

        {/* Đánh giá Sao — số sao tự nhập + ghi chú, cùng chuẩn với Duyệt việc/Đơn hàng */}
        {coTheTangSao && !laChinhToi && (
          <StarRateBar
            staffId={nhanSu?.id}
            staffName={nhanSu?.full_name}
            linkType="cham_cong"
            compact
            onDone={onXong}
          />
        )}

        {laChinhToi && coTheTangSao && (
          <div className="cc2-empty" style={{ marginTop: 12 }}>
            Không thể tự tặng thưởng cho chính mình.
          </div>
        )}

        <div className="cc2-section-title"><span>LỊCH SỬ CHẤM CÔNG</span></div>
        <LichSuCham
          logs={logs}
          danhSachCa={danhSachCa}
          boPhanTheoNguoi={{ [nhanSu?.id]: boPhan }}
          rong="Người này chưa chấm công hôm nay."
        />
      </div>
    </div>
  );
}
