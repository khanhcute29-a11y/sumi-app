import React, { useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { LichSuCham, chuCaiDau, gioThanhChu } from './dungChung';

// Hộp chi tiết một nhân sự — Quản lý bấm vào người trong danh sách thì mở ra.
// Gồm: giờ vào/ra hôm nay, khu vực TẶNG SAO, và lịch sử chấm công của người đó.
//
// ═══ VÌ SAO GỌI RPC CHỨ KHÔNG GHI THẲNG VÀO BẢNG ═══
//
// Tặng sao là TIỀN THẬT cộng vào lương (1 sao = 1.000đ). Nếu để trình duyệt ghi
// thẳng vào `staff_rewards` thì ai mở F12 cũng tự cộng thưởng cho mình được.
//
// Hàm `sumi_tang_sao_ca` dưới database mới là nơi quyết định:
//   • người bấm có phải quản lý lương, hoặc quản lý CÙNG ĐƠN VỊ với người nhận
//   • không ai tự tặng cho chính mình
//   • số sao nằm trong 1..5
//
// Màn hình này chỉ ẨN nút cho gọn mắt. Việc CHẶN nằm dưới database.

export default function ChiTietNhanSuModal({
  nhanSu, cham, logs, danhSachCa, boPhan, thuong = [],
  coTheTangSao, laChinhToi, onClose, onXong,
}) {
  const [soSao, setSoSao] = useState(0);
  const [ghiChu, setGhiChu] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState('');

  const dev = cham?.chenhLech || null;

  const tang = async () => {
    if (!soSao) { setLoi('Hãy chọn số sao trước.'); return; }
    setDangGui(true); setLoi(''); setXong('');
    try {
      const { data, error } = await supabase.rpc('sumi_tang_sao_ca', {
        p_staff_id: nhanSu.id,
        p_so_sao: soSao,
        p_ghi_chu: ghiChu.trim() || null,
        p_work_date: cham?.vaoISO ? new Date(cham.vaoISO).toISOString().slice(0, 10) : null,
        p_shift_log: null,
      });
      if (error) {
        // Migration chưa chạy trên máy chủ -> nói thẳng, đừng báo lỗi kỹ thuật.
        if (/function .* does not exist|schema cache/i.test(error.message || '')) {
          throw new Error('Máy chủ chưa bật tính năng tặng thưởng. Báo quản trị chạy bản cập nhật database.');
        }
        throw error;
      }
      if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không tặng được thưởng.');
      setXong(data?.thong_bao || 'Đã tặng thưởng.');
      setSoSao(0); setGhiChu('');
      await onXong?.();
    } catch (e) {
      setLoi(e?.message || 'Không tặng được thưởng. Thử lại giúp tôi.');
    } finally {
      setDangGui(false);
    }
  };

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

        {/* ── Tặng sao ── */}
        {coTheTangSao && !laChinhToi && (
          <div className="cc2-give-star">
            <b style={{ fontSize: 15, color: 'var(--cc2-navy)' }}>🌟 Đánh giá &amp; Tặng Sao</b>
            <p style={{ fontSize: 11, color: 'var(--cc2-muted)', margin: '4px 0 0' }}>
              Quy đổi cố định: 1 sao = 1.000đ thưởng thẳng vào lương.
            </p>

            <div className="cc2-star-group" role="group" aria-label="Chọn số sao">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`cc2-star-btn${soSao === n ? ' active' : ''}`}
                  aria-pressed={soSao === n}
                  onClick={() => setSoSao(soSao === n ? 0 : n)}
                >
                  ⭐ {n}
                </button>
              ))}
            </div>

            <textarea
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="Ghi chú cho ca này (không bắt buộc)…"
              rows={2}
              style={{
                width: '100%', marginTop: 10, padding: 11, minHeight: 60,
                border: '1px solid var(--cc2-line)', borderRadius: 13,
                background: '#fff', color: 'var(--cc2-cocoa)',
                font: 'inherit', fontSize: 14, resize: 'vertical', boxSizing: 'border-box',
              }}
            />

            {loi && <div className="cc2-error" style={{ marginTop: 10 }}>⚠️ {loi}</div>}
            {xong && <div className="cc2-ok" style={{ marginTop: 10 }}>✅ {xong}</div>}

            <button className="cc2-star-send" onClick={tang} disabled={dangGui || !soSao}>
              {dangGui ? 'Đang gửi…'
                : soSao ? `TẶNG ${soSao} SAO (${(soSao * 1000).toLocaleString('vi-VN')}đ)`
                  : 'CHỌN SỐ SAO Ở TRÊN'}
            </button>
          </div>
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
