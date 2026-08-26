import React, { useCallback, useEffect, useState } from 'react';
import { fetchApprovalRequests, resolveApprovalRequest } from '../../../lib/queries';
import { chuCaiDau } from './dungChung';

// Mục "ĐỀ XUẤT ĐỢI DUYỆT" trên màn hình Giám đốc.
//
// Dùng lại ĐÚNG hai hàm mà màn hình Duyệt cũ đang dùng
// (`fetchApprovalRequests`, `resolveApprovalRequest`) — không viết đường ghi
// dữ liệu mới. Duyệt ở đây hay duyệt ở màn hình cũ đều ra cùng một kết quả,
// cùng một dấu vết.

const NHAN_LOAI = {
  order_edit: { ten: 'Xin sửa đơn', icon: '✏️' },
  order_cancel: { ten: 'Khách xin huỷ đơn', icon: '🚫' },
  order_delete: { ten: 'Xin xoá đơn', icon: '🗑' },
  shift_recheck: { ten: 'Xin chấm công lại', icon: '⏱' },
  leave_request: { ten: 'Xin nghỉ', icon: '🏖' },
  task_exemption: { ten: 'Xin miễn công việc', icon: '📋' },
};

function khiNao(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  const phut = Math.round((Date.now() - t.getTime()) / 60000);
  if (phut < 1) return 'vừa xong';
  if (phut < 60) return `${phut} phút trước`;
  const gio = Math.floor(phut / 60);
  if (gio < 24) return `${gio} giờ trước`;
  return t.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

// `duLieuGia` chỉ dùng cho trang xem thử `?mockup=cham-cong-v2` — nơi không có
// phiên đăng nhập nên không gọi được database. Trong app thật prop này luôn
// rỗng và dữ liệu đến từ `fetchApprovalRequests` như mọi màn hình khác.
export default function DeXuatChoDuyet({ hoSo, coQuyenDuyet, duLieuGia = null }) {
  const [ds, setDs] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [dangXuLy, setDangXuLy] = useState('');
  const [moRong, setMoRong] = useState(false);

  const tai = useCallback(async () => {
    if (duLieuGia) { setDs(duLieuGia); setDangTai(false); return; }
    setDangTai(true);
    try {
      const data = await fetchApprovalRequests({ status: 'pending' });
      setDs(data || []);
      setLoi('');
    } catch (e) {
      // Không để hỏng cả màn hình chấm công chỉ vì mục phụ này lỗi.
      setLoi(e?.message || 'Không tải được danh sách đề xuất.');
    } finally {
      setDangTai(false);
    }
  }, [duLieuGia]);

  useEffect(() => { tai(); }, [tai]);

  const quyet = async (req, trangThai) => {
    setDangXuLy(req.id); setLoi('');
    try {
      if (duLieuGia) {            // bản xem thử: không ghi gì xuống database
        setDs((cu) => cu.filter((x) => x.id !== req.id));
        return;
      }
      await resolveApprovalRequest(req.id, {
        status: trangThai,
        resolvedBy: hoSo?.full_name || null,
      });
      setDs((cu) => cu.filter((x) => x.id !== req.id));
    } catch (e) {
      setLoi(e?.message || 'Không lưu được quyết định. Thử lại giúp tôi.');
    } finally {
      setDangXuLy('');
    }
  };

  const hien = moRong ? ds : ds.slice(0, 3);

  return (
    <>
      <div className="cc2-section-title">
        <span>ĐỀ XUẤT ĐỢI DUYỆT</span>
        {ds.length > 0 && (
          <span style={{
            minWidth: 26, padding: '3px 9px', borderRadius: 10,
            background: 'var(--cc2-red)', color: '#fff', fontWeight: 950, fontSize: 13,
          }}>{ds.length}</span>
        )}
      </div>

      {loi && <div className="cc2-error">⚠️ {loi}</div>}

      {dangTai ? (
        <div className="cc2-empty">Đang tải đề xuất…</div>
      ) : ds.length === 0 ? (
        <div className="cc2-empty">✅ Không có đề xuất nào đang chờ.</div>
      ) : (
        <>
          <div className="cc2-history">
            {hien.map((r) => {
              const loai = NHAN_LOAI[r.type] || { ten: r.type, icon: '📄' };
              const dang = dangXuLy === r.id;
              return (
                <article className="cc2-dexuat" key={r.id}>
                  <div className="cc2-dexuat-top">
                    <div className="cc2-staff-face" style={{ width: 42, height: 42, fontSize: 15, fontWeight: 900 }}>
                      {chuCaiDau(r.requester_name)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <b>{loai.icon} {loai.ten}</b>
                      <small>
                        {r.requester_name || 'Không rõ'}
                        {r.requester_role ? ` · ${r.requester_role}` : ''}
                        {' · '}{khiNao(r.created_at)}
                      </small>
                    </div>
                  </div>

                  <div className="cc2-dexuat-than">
                    {r.leave_date && <div>📅 Ngày nghỉ: <b>{r.leave_date}</b></div>}
                    {r.order_code && <div>🧾 Đơn: <b>{r.order_code}</b></div>}
                    {r.reason && <div>📝 {r.reason}</div>}
                    {!r.reason && !r.leave_date && !r.order_code && <div>Không có ghi chú kèm theo.</div>}
                  </div>

                  {r.photo_url && (
                    <img src={r.photo_url} alt="Ảnh kèm đề xuất" loading="lazy"
                      style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 12, marginTop: 8 }} />
                  )}

                  {coQuyenDuyet ? (
                    <div className="cc2-dexuat-nut">
                      <button className="tuchoi" disabled={dang} onClick={() => quyet(r, 'rejected')}>
                        {dang ? '…' : '✕ Từ chối'}
                      </button>
                      <button className="dongy" disabled={dang} onClick={() => quyet(r, 'approved')}>
                        {dang ? 'Đang lưu…' : '✓ Đồng ý'}
                      </button>
                    </div>
                  ) : (
                    <div className="cc2-dexuat-cho">Đang chờ Giám đốc duyệt</div>
                  )}
                </article>
              );
            })}
          </div>

          {ds.length > 3 && (
            <button className="cc2-quiet-action" onClick={() => setMoRong(!moRong)}>
              {moRong ? '▴ Thu gọn' : `▾ Xem thêm ${ds.length - 3} đề xuất`}
            </button>
          )}
        </>
      )}
    </>
  );
}
