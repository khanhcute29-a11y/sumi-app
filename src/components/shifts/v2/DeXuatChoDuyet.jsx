import React, { useCallback, useEffect, useState } from 'react';
import { fetchApprovalRequests, resolveApprovalRequest } from '../../../lib/queries';
import TheDeXuat from './TheDeXuat';

// Mục "ĐỀ XUẤT ĐỢI DUYỆT" trên màn hình Giám đốc.
//
// Dùng lại ĐÚNG hai hàm mà màn hình Duyệt cũ đang dùng
// (`fetchApprovalRequests`, `resolveApprovalRequest`) — không viết đường ghi
// dữ liệu mới. Duyệt ở đây hay duyệt ở màn hình cũ đều ra cùng một kết quả,
// cùng một dấu vết.

// `duLieuGia` chỉ dùng cho trang xem thử `?mockup=cham-cong-v2` — nơi không có
// phiên đăng nhập nên không gọi được database. Trong app thật prop này luôn
// rỗng và dữ liệu đến từ `fetchApprovalRequests` như mọi màn hình khác.
export default function DeXuatChoDuyet({ hoSo, capCuaToi = 1, duLieuGia = null, onDaXuLy }) {
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
      // Đơn của CHÍNH MÌNH không hiện ở đây — không ai tự duyệt đơn mình gửi.
      // Database cũng chặn, nhưng bày ra rồi bấm vào báo lỗi thì khó chịu.
      setDs((data || []).filter((r) => r.requester_id !== hoSo?.id));
      setLoi('');
    } catch (e) {
      // Không để hỏng cả màn hình chấm công chỉ vì mục phụ này lỗi.
      setLoi(e?.message || 'Không tải được danh sách đề xuất.');
    } finally {
      setDangTai(false);
    }
  }, [duLieuGia, hoSo?.id]);

  useEffect(() => { tai(); }, [tai]);

  const quyet = async (req, dongY) => {
    setDangXuLy(req.id); setLoi('');
    try {
      if (duLieuGia) {            // bản xem thử: không ghi gì xuống database
        setDs((cu) => cu.filter((x) => x.id !== req.id));
        return;
      }
      await resolveApprovalRequest(req.id, { status: dongY ? 'approved' : 'rejected' });
      await tai();
      await onDaXuLy?.();
    } catch (e) {
      setLoi(e?.message || 'Không lưu được quyết định. Thử lại giúp tôi.');
    } finally {
      setDangXuLy('');
    }
  };

  // Cấp 1 chỉ thấy đơn còn đang chờ mình. Cấp 2 (Giám đốc) thấy tất cả đơn
  // đang treo — cả đơn cấp 1 chưa xử để biết chỗ nào đang tắc.
  const thuocVeToi = (r) => {
    const cap1 = r.cap1_status || 'pending';
    return capCuaToi === 2 ? true : cap1 === 'pending';
  };

  const canXu = ds.filter(thuocVeToi);
  const hien = moRong ? canXu : canXu.slice(0, 3);

  return (
    <>
      <div className="cc2-section-title">
        <span>ĐỀ XUẤT ĐỢI DUYỆT</span>
        {canXu.length > 0 && (
          <span style={{
            minWidth: 26, padding: '3px 9px', borderRadius: 10,
            background: 'var(--cc2-red)', color: '#fff', fontWeight: 950, fontSize: 13,
          }}>{canXu.length}</span>
        )}
      </div>

      {loi && <div className="cc2-error">⚠️ {loi}</div>}

      {dangTai ? (
        <div className="cc2-empty">Đang tải đề xuất…</div>
      ) : canXu.length === 0 ? (
        <div className="cc2-empty">✅ Không có đề xuất nào đang chờ bạn.</div>
      ) : (
        <>
          <div className="cc2-history">
            {hien.map((r) => (
              <TheDeXuat
                key={r.id}
                don={r}
                dangXuLy={dangXuLy === r.id}
                onDongY={(d) => quyet(d, true)}
                onTuChoi={(d) => quyet(d, false)}
              />
            ))}
          </div>

          {canXu.length > 3 && (
            <button className="cc2-quiet-action" onClick={() => setMoRong(!moRong)}>
              {moRong ? '▴ Thu gọn' : `▾ Xem thêm ${canXu.length - 3} đề xuất`}
            </button>
          )}
        </>
      )}
    </>
  );
}
