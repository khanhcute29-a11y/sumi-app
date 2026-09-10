import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { hasAnyRole } from '../lib/roles';
import { localDateStr } from '../lib/date';
import SoKetToanKpi from '../components/tasks/v2/SoKetToanKpi';

// Tổng quan KPI — 1 màn xem đủ mọi mặt của 1 nhân viên (việc, giờ làm/tăng
// ca, chuyên cần, sao thưởng/phạt), theo khoảng ngày tự chọn. Giám đốc xem
// được tất cả nhân viên (bảng xếp hạng rút gọn + xem chi tiết từng người),
// nhân viên thường chỉ xem của chính mình.
//
// KHÔNG viết lại phần "Sổ kết toán KPI tháng" (điểm KPI việc/giao hàng quy ra
// lương, có chốt tháng đông cứng) — dùng lại nguyên component SoKetToanKpi có
// sẵn làm tab "Chốt tháng" ở đây, vì đó là con số CHÍNH THỨC dùng trả lương,
// viết lại sẽ tạo 2 nguồn tính khác nhau và lệch nhau về sau.

function homNayStr() {
  return localDateStr(new Date());
}
function dauThangStr() {
  const d = new Date();
  return localDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
}

function formatTien(n) {
  return `${Math.round(n || 0).toLocaleString('vi-VN')}đ`;
}
function formatPhut(m) {
  const so = Number(m || 0);
  return `${Math.floor(so / 60)} giờ ${so % 60} phút`;
}

const cardStyle = {
  padding: 14, borderRadius: 16, background: 'var(--surface-card)',
  border: '1px solid var(--border-default)',
};

function ThongKe({ label, value, mau }) {
  return (
    <div style={cardStyle}>
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ font: 'var(--text-display-sm)', color: mau || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

// Điểm KPI tổng hợp theo vị trí (đánh giá bên ngoài lần 3) — thay "10 ô số
// rời" bằng 1 điểm 0-100 giải trình được: chuẩn hoá từng chỉ số, chia lại
// trọng số khi thiếu dữ liệu (không cho 0 điểm), kẹp trần/sàn. Xem hàm SQL
// compute_kpi_score (migration 202609101100) để biết công thức đầy đủ.
const MAU_DIEM = {
  xanh_la: 'var(--status-success)', xanh_duong: '#2563eb', vang: '#ca8a04',
  cam: 'var(--status-warning, #ea580c)', do: 'var(--status-danger)',
};

function TheDiemKPI({ diem }) {
  if (!diem) return null;
  if (diem.score === null || diem.score === undefined) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: 20 }}>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)', fontWeight: 700 }}>Chưa đủ dữ liệu để tính điểm KPI tổng hợp</div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)', marginTop: 4 }}>Cần thêm dữ liệu chấm công/công việc trong kỳ này.</div>
      </div>
    );
  }
  const mau = MAU_DIEM[diem.mau] || 'var(--text-primary)';
  return (
    <div style={{ ...cardStyle, textAlign: 'center', padding: 20, borderColor: mau, borderWidth: 2 }}>
      <div style={{ font: 'var(--text-display-lg)', fontWeight: 900, color: mau }}>{diem.score} / 100</div>
      <div style={{ font: 'var(--text-body)', fontWeight: 800, color: mau, marginTop: 2 }}>{diem.label}</div>
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)', marginTop: 6 }}>
        Dùng {diem.so_chi_so_dung}/{diem.tong_chi_so} chỉ số (chỉ số thiếu dữ liệu được loại, chia lại trọng số cho phần còn lại)
      </div>
      {(diem.chi_tiet || []).length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
          {diem.chi_tiet.map((c) => (
            <div key={c.code}>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body-sm)', marginBottom: 3 }}>
                <span>{c.label} <span style={{ color: 'var(--text-secondary)' }}>(giá trị: {c.gia_tri})</span></span>
                <span style={{ fontWeight: 700 }}>{c.diem}đ · ×{c.trong_so_thuc}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-subtle, #eee)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${c.diem}%`, background: c.diem < 40 ? 'var(--status-danger)' : mau, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChiTietNhanVien({ staffId, from, to }) {
  const [data, setData] = useState(null);
  const [diem, setDiem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!staffId) return;
    let huy = false;
    setLoading(true); setError('');
    Promise.all([
      supabase.rpc('get_employee_kpi_overview', { p_staff_id: staffId, p_from: from, p_to: to }),
      supabase.rpc('compute_kpi_score', { p_staff_id: staffId, p_from: from, p_to: to }),
    ]).then(([ov, sc]) => {
      if (huy) return;
      if (ov.error) setError(ov.error.message || 'Không tải được KPI.');
      else setData(ov.data);
      setDiem(sc.data || null);
    }).finally(() => { if (!huy) setLoading(false); });
    return () => { huy = true; };
  }, [staffId, from, to]);

  if (loading) return <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)' }}>Đang tải…</div>;
  if (error) return <div style={{ padding: 12, color: 'var(--status-danger)' }}>⚠️ {error}</div>;
  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <TheDiemKPI diem={diem} />

      <div style={{ font: 'var(--text-body-sm)', fontWeight: 700, color: 'var(--text-secondary)' }}>Dữ liệu tham khảo (chưa/không tính vào điểm tổng hợp)</div>

      <div>
        <div style={{ font: 'var(--text-body-sm)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>📋 Công việc</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <ThongKe label="Tỷ lệ hoàn thành" value={`${data.completion_rate ?? 0}%`} mau="var(--status-success)" />
          <ThongKe label="Việc được giao" value={data.assigned_tasks ?? 0} />
          <ThongKe label="Việc hoàn thành" value={data.completed_tasks ?? 0} />
          <ThongKe label="Đúng hạn" value={data.on_time_tasks ?? 0} />
          <ThongKe label="Việc hằng ngày xong" value={data.daily_tasks_completed ?? 0} />
          <ThongKe label="Loại trừ đã duyệt" value={data.approved_exclusions ?? 0} />
        </div>
      </div>

      <div>
        <div style={{ font: 'var(--text-body-sm)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>⏱️ Giờ làm & Chuyên cần</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <ThongKe label="Ngày làm việc" value={data.work_days ?? 0} />
          <ThongKe label="Tổng giờ làm" value={formatPhut(data.work_minutes)} />
          <ThongKe label="Tăng ca" value={formatPhut(data.overtime_minutes)} />
          <ThongKe label="Số lần đi trễ" value={data.late_count ?? 0} mau={data.late_count > 0 ? 'var(--status-danger)' : undefined} />
        </div>
      </div>

      <div>
        {/* ⚠️ Đổi khung hiển thị (10/09/2026): KHÔNG hiện số âm/"tiền bị trừ"
            cho phần chưa đạt — tránh đọc như trừ lương (Điều 127 BLLĐ 2019
            cấm phạt tiền/cắt lương thay kỷ luật lao động). "Chưa đạt" chỉ là
            chưa đủ điều kiện nhận thưởng chuyên cần, không phải bị lấy lại
            tiền đã có. Dữ liệu gốc (staff_violations) vẫn giữ nguyên, chỉ
            đổi cách tổng hợp hiển thị ra đây. */}
        <div style={{ font: 'var(--text-body-sm)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>🌟 Thưởng chuyên cần (Gieo Hạt)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <ThongKe label="Được cộng" value={`+${data.star_cong_sao ?? 0} sao (${formatTien(data.star_cong_tien)})`} mau="var(--status-success)" />
          <ThongKe label="Chưa đạt (không trừ lương)" value={`${data.star_chua_dat_sao ?? 0} sao`} />
        </div>
        <div style={{ ...cardStyle, marginTop: 8, textAlign: 'center' }}>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)' }}>Thưởng chuyên cần thực nhận</div>
          <div style={{ font: 'var(--text-display-md)', color: 'var(--status-success)' }}>
            +{data.star_rong_sao ?? 0} sao · {formatTien(data.star_rong_tien)}
          </div>
        </div>
      </div>

      {data.output_quantity > 0 && (
        <ThongKe label="Sản lượng ghi nhận" value={data.output_quantity} />
      )}
    </div>
  );
}

function BangXepHang({ from, to, onChonNhanVien }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let huy = false;
    setLoading(true); setError('');
    supabase.rpc('list_staff_kpi_overview', { p_from: from, p_to: to })
      .then(({ data, error: e }) => {
        if (huy) return;
        if (e) setError(e.message || 'Không tải được danh sách.');
        else setList(data || []);
      })
      .finally(() => { if (!huy) setLoading(false); });
    return () => { huy = true; };
  }, [from, to]);

  if (loading) return <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)' }}>Đang tải…</div>;
  if (error) return <div style={{ padding: 12, color: 'var(--status-danger)' }}>⚠️ {error}</div>;
  if (list.length === 0) return <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)' }}>Chưa có dữ liệu.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.map((r) => (
        <button
          key={r.staff_id}
          onClick={() => onChonNhanVien(r.staff_id, r.full_name)}
          style={{
            ...cardStyle, textAlign: 'left', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between', gap: 10,
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>{r.full_name}</div>
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)' }}>
              {r.completed_tasks} việc xong{r.late_count > 0 ? ` · ${r.late_count} lần trễ` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {/* Sao ròng đã kẹp sàn 0 ở RPC — không còn ca âm, bỏ nhánh màu đỏ. */}
            <div style={{ fontWeight: 800, color: 'var(--status-success)' }}>+{r.star_rong_sao} sao</div>
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)' }}>{formatTien(r.star_rong_tien)}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

export default function KpiTongQuanScreen() {
  const { profile } = useAuth();
  const laGiamDoc = hasAnyRole(profile, ['owner', 'admin']);
  const [tab, setTab] = useState('nhanh'); // 'nhanh' | 'chot'
  const [from, setFrom] = useState(dauThangStr());
  const [to, setTo] = useState(homNayStr());
  const [nhanVienDangXem, setNhanVienDangXem] = useState(
    laGiamDoc ? null : { id: profile?.id, ten: profile?.full_name },
  );

  useEffect(() => {
    if (!laGiamDoc) setNhanVienDangXem({ id: profile?.id, ten: profile?.full_name });
  }, [laGiamDoc, profile?.id, profile?.full_name]);

  const khoangNgayHopLe = useMemo(() => from && to && from <= to, [from, to]);

  return (
    <div style={{ padding: 16, maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ font: 'var(--text-display-sm)', color: 'var(--text-primary)' }}>📊 Tổng quan KPI</div>

      {/* Chế độ chạy bóng (10/09/2026, theo đề xuất chống gian lận/giữ niềm
          tin từ bên ngoài): số liệu KPI/thưởng chuyên cần hiện tại chỉ để
          THAM KHẢO, chưa có nơi nào trong app tự động trừ vào lương thật
          (fetchWagesSummaryForMonth không đọc star_transactions) — nói rõ
          điều này ra màn hình để không ai hiểu nhầm đây là số đã chốt. */}
      <div style={{
        padding: '10px 14px', borderRadius: 12, background: 'var(--surface-warning-soft, #fff3cd)',
        color: '#805000', font: 'var(--text-body-sm)', fontWeight: 700,
      }}>
        ⚠️ Đang chạy thử — số liệu này chưa dùng để tính thưởng/trừ lương chính thức. Thấy sai vui lòng báo lại.
      </div>

      {laGiamDoc && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setTab('nhanh')}
            style={{
              flex: 1, minHeight: 44, borderRadius: 12, border: '1px solid var(--border-default)',
              background: tab === 'nhanh' ? 'var(--surface-selected, #f4e9d8)' : 'var(--surface-card)',
              fontWeight: 700, cursor: 'pointer',
            }}
          >Xem nhanh</button>
          <button
            onClick={() => setTab('chot')}
            style={{
              flex: 1, minHeight: 44, borderRadius: 12, border: '1px solid var(--border-default)',
              background: tab === 'chot' ? 'var(--surface-selected, #f4e9d8)' : 'var(--surface-card)',
              fontWeight: 700, cursor: 'pointer',
            }}
          >Chốt tháng</button>
        </div>
      )}

      {tab === 'chot' && laGiamDoc ? (
        <SoKetToanKpi />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)' }}>
              Từ ngày
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                style={{ width: '100%', minHeight: 44, borderRadius: 10, border: '1px solid var(--border-default)', padding: '0 8px' }} />
            </label>
            <label style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)' }}>
              Đến ngày
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                style={{ width: '100%', minHeight: 44, borderRadius: 10, border: '1px solid var(--border-default)', padding: '0 8px' }} />
            </label>
          </div>

          {!khoangNgayHopLe && (
            <div style={{ color: 'var(--status-danger)', font: 'var(--text-body-sm)' }}>
              "Từ ngày" phải trước hoặc bằng "Đến ngày".
            </div>
          )}

          {khoangNgayHopLe && laGiamDoc && nhanVienDangXem && (
            <button
              onClick={() => setNhanVienDangXem(null)}
              style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--text-brand)', fontWeight: 700, cursor: 'pointer', padding: 0 }}
            >← Quay lại bảng xếp hạng</button>
          )}

          {khoangNgayHopLe && (
            laGiamDoc && !nhanVienDangXem ? (
              <BangXepHang from={from} to={to} onChonNhanVien={(id, ten) => setNhanVienDangXem({ id, ten })} />
            ) : (
              nhanVienDangXem && (
                <>
                  {laGiamDoc && (
                    <div style={{ font: 'var(--text-body)', fontWeight: 800 }}>{nhanVienDangXem.ten}</div>
                  )}
                  <ChiTietNhanVien staffId={nhanVienDangXem.id} from={from} to={to} />
                </>
              )
            )
          )}
        </>
      )}
    </div>
  );
}
