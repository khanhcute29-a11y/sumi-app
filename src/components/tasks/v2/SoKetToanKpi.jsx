import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

// Sổ kết toán KPI tháng — mockup task-lifecycle-v2-approved, mục cuối màn
// hình Giám đốc.
//
// Trước khi tháng được CHỐT: hiện số DỰ KIẾN (đọc qua RPC
// `sumi_xem_truoc_kpi_thang`, không ghi gì xuống database).
// Sau khi chốt: đọc thẳng `payroll_kpi_ledger` — con số ĐÔNG CỨNG dùng để trả
// lương, không tính lại nữa dù task/đơn liên quan có bị sửa sau đó.

const thangNamHomNay = () => {
  const d = new Date();
  return { thang: d.getMonth() + 1, nam: d.getFullYear() };
};

function formatTien(n) {
  return `${Math.round(n || 0).toLocaleString('vi-VN')}đ`;
}

export default function SoKetToanKpi() {
  const [{ thang, nam }, setThangNam] = useState(thangNamHomNay);
  const [daChot, setDaChot] = useState(null);   // null = chưa biết, [] = chưa chốt, [...] = đã chốt
  const [duKien, setDuKien] = useState(null);
  const [dangTai, setDangTai] = useState(true);
  const [dangChot, setDangChot] = useState(false);
  const [loi, setLoi] = useState('');
  const [thongBao, setThongBao] = useState('');

  const tai = useCallback(async () => {
    setDangTai(true); setLoi(''); setThongBao('');
    try {
      const { data: chot, error: eChot } = await supabase
        .from('payroll_kpi_ledger')
        .select('*')
        .eq('thang', thang).eq('nam', nam)
        .order('tong_diem_kpi', { ascending: false });
      if (eChot) throw eChot;

      if (chot && chot.length > 0) {
        setDaChot(chot);
        setDuKien(null);
      } else {
        setDaChot([]);
        const { data: xem, error: eXem } = await supabase.rpc('sumi_xem_truoc_kpi_thang', {
          p_thang: thang, p_nam: nam,
        });
        if (eXem) throw eXem;
        setDuKien(xem || []);
      }
    } catch (e) {
      if (/function .* does not exist|schema cache/i.test(e?.message || '')) {
        setLoi('Máy chủ chưa bật sổ kết toán KPI. Báo quản trị chạy bản cập nhật database.');
      } else {
        setLoi(e?.message || 'Không tải được sổ kết toán.');
      }
    } finally {
      setDangTai(false);
    }
  }, [thang, nam]);

  useEffect(() => { tai(); }, [tai]);

  const chotSo = async () => {
    if (!window.confirm(
      `Chốt sổ KPI tháng ${thang}/${nam}?\n\nSau khi chốt, số liệu sẽ ĐÔNG CỨNG để làm căn cứ trả lương — sửa việc/đơn của tháng này về sau sẽ không làm đổi số đã chốt.`,
    )) return;

    setDangChot(true); setLoi(''); setThongBao('');
    try {
      const { data, error } = await supabase.rpc('sumi_chot_kpi_thang', { p_thang: thang, p_nam: nam });
      if (error) throw error;
      if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không chốt được sổ.');
      setThongBao(data?.thong_bao || 'Đã chốt sổ.');
      await tai();
    } catch (e) {
      setLoi(e?.message || 'Không chốt được sổ. Thử lại giúp tôi.');
    } finally {
      setDangChot(false);
    }
  };

  const doiThang = (buoc) => {
    setThangNam(({ thang: t, nam: n }) => {
      const d = new Date(n, t - 1 + buoc, 1);
      return { thang: d.getMonth() + 1, nam: d.getFullYear() };
    });
  };

  const dsHien = daChot && daChot.length > 0 ? daChot : (duKien || []);
  const laDuKien = !(daChot && daChot.length > 0);

  return (
    <>
      <div className="cv-divider">
        <span>💰 Sổ kết toán KPI tháng {thang}/{nam}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <button className="cv-btn outline" style={{ minWidth: 44, padding: '0 12px' }} onClick={() => doiThang(-1)}>‹</button>
        <span style={{ flex: 1, textAlign: 'center', fontWeight: 900 }}>Tháng {thang}/{nam}</span>
        <button className="cv-btn outline" style={{ minWidth: 44, padding: '0 12px' }} onClick={() => doiThang(1)}>›</button>
      </div>

      {loi && <div className="cv-error">⚠️ {loi}</div>}
      {thongBao && (
        <div style={{
          marginBottom: 10, padding: '9px 12px', borderRadius: 12,
          background: 'var(--cv-success-soft, #e6f4ea)', color: '#1e7e4c', fontWeight: 800, fontSize: 13,
        }}>✅ {thongBao}</div>
      )}

      {dangTai ? (
        <div className="cv-empty">Đang tải…</div>
      ) : (
        <>
          <div style={{
            marginBottom: 10, padding: '8px 12px', borderRadius: 12,
            background: laDuKien ? 'var(--cv-warning-soft, #fff3cd)' : 'var(--cv-success-soft, #e6f4ea)',
            color: laDuKien ? '#805000' : '#1e7e4c', fontSize: 12.5, fontWeight: 800,
          }}>
            {laDuKien
              ? '🕐 Số DỰ KIẾN — chưa chốt, vẫn đổi theo dữ liệu mới nhất.'
              : `🔒 Đã chốt lúc ${daChot[0]?.chot_luc ? new Date(daChot[0].chot_luc).toLocaleString('vi-VN') : ''} — số này không đổi nữa.`}
          </div>

          {dsHien.length === 0 ? (
            <div className="cv-empty">Chưa có ai phát sinh KPI trong tháng này.</div>
          ) : (
            <section className="ledger" style={{
              border: '1px solid var(--cv-border)', borderRadius: 18, background: '#fff', overflow: 'hidden',
            }}>
              {dsHien.map((r) => (
                <div key={r.staff_id} style={{
                  display: 'grid', gridTemplateColumns: '1fr 90px', gap: 10,
                  padding: 12, borderBottom: '1px solid #eee1d3',
                }}>
                  <div>
                    <b style={{ display: 'block', fontSize: 14 }}>{r.staff_name}</b>
                    <small style={{ display: 'block', color: 'var(--cv-muted)', fontSize: 11, marginTop: 2 }}>
                      {r.so_viec_xong} việc xong
                      {r.so_lan_tre_co_ly_do ? ` · ${r.so_lan_tre_co_ly_do} lần trễ nhận` : ''}
                      {r.so_lan_giao_hang ? ` · ${r.so_lan_giao_hang} lần giao hàng` : ''}
                    </small>
                  </div>
                  <strong style={{ textAlign: 'right', color: 'var(--cv-success, #1e7e4c)' }}>
                    +{r.tong_diem_kpi ?? 0}
                    {!laDuKien && (
                      <><br /><span style={{ fontSize: 11, fontWeight: 700 }}>{formatTien(r.quy_doi_tien)}</span></>
                    )}
                  </strong>
                </div>
              ))}
            </section>
          )}

          {laDuKien && dsHien.length > 0 && (
            <button className="cv-btn success full" style={{ marginTop: 12 }} disabled={dangChot} onClick={chotSo}>
              {dangChot ? 'Đang chốt…' : `🔒 Chốt sổ tháng ${thang}/${nam}`}
            </button>
          )}
        </>
      )}
    </>
  );
}
