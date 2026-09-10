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

function ChiTietNhanVien({ staffId, from, to }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!staffId) return;
    let huy = false;
    setLoading(true); setError('');
    supabase.rpc('get_employee_kpi_overview', { p_staff_id: staffId, p_from: from, p_to: to })
      .then(({ data: d, error: e }) => {
        if (huy) return;
        if (e) setError(e.message || 'Không tải được KPI.');
        else setData(d);
      })
      .finally(() => { if (!huy) setLoading(false); });
    return () => { huy = true; };
  }, [staffId, from, to]);

  if (loading) return <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)' }}>Đang tải…</div>;
  if (error) return <div style={{ padding: 12, color: 'var(--status-danger)' }}>⚠️ {error}</div>;
  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
