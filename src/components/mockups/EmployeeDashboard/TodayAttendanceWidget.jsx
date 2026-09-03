import React, { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import './employee-overview-v4.css';
import { fetchMyTodayAttendance } from '../../../lib/employeeOverviewV4';
import { chuanHoaCa, boPhanCuaHoSo, caChuanCuaLog } from '../../../lib/chamCong';
import { gomPhien, nhanChenhLech } from '../../shifts/v2/dungChung';

// Widget "CHẤM CÔNG HÔM NAY" — CHÉP LẠI có chủ đích từ EmployeeOverviewV4Inner
// (không import/tái cấu trúc file đó) để dùng cho Bếp trưởng/Quản lý, thay
// cho <ShiftTodayCard> kiểu cũ. Yêu cầu 04/09/2026: "phía trên cùng chỉ cần
// hiển thị Chấm công của tôi giống giao diện trong của tôi".
//
// CỐ Ý KHÔNG refactor EmployeeOverviewV4Inner để dùng chung: đó là màn hình
// đang chạy thật ổn định cho toàn bộ nhân viên — sự cố gần nhất (revert
// 532f8f8) xảy ra đúng lúc sửa một màn home đang sống, nên chấp nhận trùng
// một đoạn nhỏ logic còn hơn rủi ro sửa nhầm màn đã chạy tốt.
//
// Bấm vào là điều hướng THẲNG sang 'shifts' (nơi có nút Bắt đầu/Kết thúc ca
// VÀ lịch sử đầy đủ) — không tự vẽ nút bấm giờ ở đây.
const gioVN = (iso) => iso
  ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
  : '--:--';

export default function TodayAttendanceWidget({ profile, onNavigate }) {
  const [todayAtt, setTodayAtt] = useState(null);

  useEffect(() => {
    if (!profile?.id) return;
    let huy = false;
    const tai = () => {
      fetchMyTodayAttendance(profile.id)
        .then(({ logs, caRows }) => {
          if (huy) return;
          const danhSachCa = chuanHoaCa(caRows);
          const boPhan = boPhanCuaHoSo(profile);
          const phien = gomPhien(logs);
          const phienHienTai = phien[phien.length - 1] || null;
          const dangTrongCa = !!(phienHienTai && !phienHienTai.ra);
          const caPhien = phienHienTai ? caChuanCuaLog(phienHienTai.vao, danhSachCa, boPhan) : null;
          const devVao = phienHienTai ? nhanChenhLech(phienHienTai.vao, caPhien) : null;
          const ca = caPhien || danhSachCa.find((c) => c.boPhan === boPhan) || null;
          setTodayAtt({
            boPhan, ca, phienHienTai, dangTrongCa, devVao,
            soCaXong: phien.filter((p) => p.ra).length,
          });
        })
        .catch(() => { if (!huy) setTodayAtt({ loi: true }); });
    };
    tai();
    window.addEventListener('sumi-shift-changed', tai);
    return () => { huy = true; window.removeEventListener('sumi-shift-changed', tai); };
  }, [profile?.id]);

  return (
    <button
      className={`eov4-attendance${
        todayAtt?.dangTrongCa ? (todayAtt.devVao?.loai === 'bad' ? ' is-late' : ' is-working')
          : todayAtt?.phienHienTai ? ' is-done'
            : ' is-waiting'
      }`}
      onClick={() => onNavigate?.('shifts')}
    >
      <div className="eov4-attendance-top">
        <span className="eov4-attendance-dot">
          {todayAtt?.dangTrongCa ? '●' : todayAtt?.phienHienTai ? '✓' : '◷'}
        </span>
        <div className="eov4-attendance-txt">
          <small>CHẤM CÔNG HÔM NAY</small>
          <strong>
            {!todayAtt ? 'Đang tải…'
              : todayAtt.loi ? 'Không tải được — bấm để mở'
                : todayAtt.dangTrongCa ? 'Đang trong ca'
                  : todayAtt.phienHienTai
                    ? `Đã hoàn thành ${todayAtt.soCaXong > 1 ? `${todayAtt.soCaXong} ca` : 'ca'}`
                    : todayAtt.ca ? 'Chưa bắt đầu ca' : 'Không theo ca cố định'}
          </strong>
        </div>
        <ChevronRight size={18} className="eov4-attendance-arrow" />
      </div>

      {todayAtt?.phienHienTai && (
        <div className="eov4-attendance-detail">
          Vào lúc <b>{gioVN(todayAtt.phienHienTai.vao?.checkin_time)}</b>
          {todayAtt.devVao && (
            <span className={`eov4-attendance-tag ${todayAtt.devVao.loai}`}>{todayAtt.devVao.chu}</span>
          )}
        </div>
      )}
      {!todayAtt?.phienHienTai && todayAtt?.ca && (
        <div className="eov4-attendance-detail">
          Ca {todayAtt.ca.ten} · {todayAtt.ca.batDau}–{todayAtt.ca.ketThuc} · có mặt trước <b>{todayAtt.ca.moc}</b>
        </div>
      )}
    </button>
  );
}
