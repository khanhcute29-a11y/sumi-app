import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { hasAnyRole } from '../lib/roles';
import { localDateStr } from '../lib/date';
import SoKetToanKpi from '../components/tasks/v2/SoKetToanKpi';
import { IconDashboard, IconClipboard, IconClock, IconCake, IconTruck, IconStar, IconSettings, IconMapPin, IconWarning } from '../components/icons/FrogIcons';

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

function TieuDeMuc({ Icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: 'var(--text-body-sm)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
      <Icon size={16} />
      <span>{children}</span>
    </div>
  );
}

function formatGio(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
const TEN_THU_DAY_DU = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
function formatNgayNgan(ngay) {
  if (!ngay) return '';
  const d = new Date(`${ngay}T00:00:00`);
  return `${TEN_THU_DAY_DU[d.getDay()]}, ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
}
function linkBanDo(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
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

// ---------------------------------------------------------------------------
// Ghi nhận bánh lỗi / khiếu nại khách — 2 nguồn dữ liệu KPI còn thiếu (đã
// xác nhận trước đó không nơi nào trong app ghi lại việc này). Ai cũng tự
// khai được cho chính mình (khuyến khích trung thực theo P6.3); gán cho
// người khác thì RLS chỉ cho giám đốc (product_defect_logs, migration
// 202609101210). CHƯA nối vào compute_kpi_score — cần vài tuần dữ liệu thật
// để chốt target/floor, tránh bịa số.
// ---------------------------------------------------------------------------
const DANH_MUC_KHIEU_NAI = [
  { value: 'giao_tre', label: 'Giao trễ' },
  { value: 'sai_don', label: 'Sai đơn' },
  { value: 'chat_luong', label: 'Chất lượng' },
  { value: 'thai_do', label: 'Thái độ phục vụ' },
  { value: 'khac', label: 'Khác' },
];

function inputStyle() {
  return { width: '100%', minHeight: 44, borderRadius: 10, border: '1px solid var(--border-default)', padding: '0 10px', font: 'var(--text-body)' };
}

function GhiNhanBanhLoi({ staffId, myId, tuKhai, onDaGhi }) {
  const [mo, setMo] = useState(false);
  const [ten, setTen] = useState('');
  const [soLuong, setSoLuong] = useState('1');
  const [lyDo, setLyDo] = useState('');
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState('');

  const luu = async () => {
    if (!ten.trim()) { setLoi('Nhập tên sản phẩm bị lỗi.'); return; }
    setDangLuu(true); setLoi('');
    const { error } = await supabase.from('product_defect_logs').insert({
      staff_id: staffId, reported_by: myId, tu_khai: tuKhai,
      product_name: ten.trim(), quantity: Number(soLuong) || 1, reason: lyDo.trim() || null,
    });
    setDangLuu(false);
    if (error) { setLoi(error.message); return; }
    setTen(''); setSoLuong('1'); setLyDo(''); setMo(false);
    onDaGhi?.();
  };

  if (!mo) {
    return (
      <button onClick={() => setMo(true)} style={{ minHeight: 44, borderRadius: 12, border: '1px dashed var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer' }}>
        + Báo bánh lỗi {tuKhai ? '(tự khai)' : ''}
      </button>
    );
  }
  return (
    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input placeholder="Tên sản phẩm" value={ten} onChange={(e) => setTen(e.target.value)} style={inputStyle()} />
      <input type="number" min="1" placeholder="Số lượng" value={soLuong} onChange={(e) => setSoLuong(e.target.value)} style={inputStyle()} />
      <input placeholder="Lý do (tuỳ chọn)" value={lyDo} onChange={(e) => setLyDo(e.target.value)} style={inputStyle()} />
      {loi && <div style={{ color: 'var(--status-danger)', font: 'var(--text-body-sm)' }}>{loi}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setMo(false)} style={{ flex: 1, minHeight: 40, borderRadius: 10, border: '1px solid var(--border-default)', background: 'transparent', cursor: 'pointer' }}>Huỷ</button>
        <button onClick={luu} disabled={dangLuu} style={{ flex: 1, minHeight: 40, borderRadius: 10, border: 'none', background: 'var(--status-success)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          {dangLuu ? 'Đang lưu…' : 'Ghi nhận'}
        </button>
      </div>
    </div>
  );
}

function GhiNhanKhieuNai({ staffId, myId, onDaGhi }) {
  const [mo, setMo] = useState(false);
  const [maDon, setMaDon] = useState('');
  const [danhMuc, setDanhMuc] = useState('giao_tre');
  const [moTa, setMoTa] = useState('');
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState('');

  const luu = async () => {
    if (!moTa.trim()) { setLoi('Mô tả ngắn gọn khiếu nại.'); return; }
    setDangLuu(true); setLoi('');
    const { error } = await supabase.from('customer_complaints').insert({
      staff_id: staffId, created_by: myId, order_code: maDon.trim() || null,
      category: danhMuc, description: moTa.trim(),
    });
    setDangLuu(false);
    if (error) { setLoi(error.message); return; }
    setMaDon(''); setMoTa(''); setMo(false);
    onDaGhi?.();
  };

  if (!mo) {
    return (
      <button onClick={() => setMo(true)} style={{ minHeight: 44, borderRadius: 12, border: '1px dashed var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer' }}>
        + Ghi khiếu nại khách
      </button>
    );
  }
  return (
    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input placeholder="Mã đơn (tuỳ chọn)" value={maDon} onChange={(e) => setMaDon(e.target.value)} style={inputStyle()} />
      <select value={danhMuc} onChange={(e) => setDanhMuc(e.target.value)} style={inputStyle()}>
        {DANH_MUC_KHIEU_NAI.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select>
      <input placeholder="Mô tả ngắn gọn" value={moTa} onChange={(e) => setMoTa(e.target.value)} style={inputStyle()} />
      {loi && <div style={{ color: 'var(--status-danger)', font: 'var(--text-body-sm)' }}>{loi}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setMo(false)} style={{ flex: 1, minHeight: 40, borderRadius: 10, border: '1px solid var(--border-default)', background: 'transparent', cursor: 'pointer' }}>Huỷ</button>
        <button onClick={luu} disabled={dangLuu} style={{ flex: 1, minHeight: 40, borderRadius: 10, border: 'none', background: 'var(--status-danger)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          {dangLuu ? 'Đang lưu…' : 'Ghi nhận'}
        </button>
      </div>
    </div>
  );
}

const SO_DONG_MOI_LAN = 7;

function DongChamCa({ d }) {
  const dangThieuRa = d.trang_thai === 'missing_checkout';
  const laNghi = d.trang_thai === 'leave';
  return (
    <div style={{ ...cardStyle, padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, font: 'var(--text-body-sm)' }}>{formatNgayNgan(d.work_date)}</span>
        <span style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)' }}>{d.shift_label || ''}{d.branch ? ` · ${d.branch}` : ''}</span>
      </div>
      {laNghi ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', fontWeight: 700 }}>🌴 Xin nghỉ</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ font: 'var(--text-body)', fontWeight: 700 }}>
            {formatGio(d.vao)} → {dangThieuRa ? <span style={{ color: 'var(--status-warning, #ca8a04)' }}>chưa chấm ra</span> : formatGio(d.ra)}
          </span>
          {d.late_minutes > 0 && (
            <span style={{
              font: 'var(--text-caption)', color: 'var(--status-danger)', fontWeight: 700,
              background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '2px 8px',
            }}>Trễ {d.late_minutes} phút</span>
          )}
          <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            {d.vao_lat != null && d.vao_lng != null && (
              <a href={linkBanDo(d.vao_lat, d.vao_lng)} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 3, font: 'var(--text-caption)', color: 'var(--text-brand)', fontWeight: 700, textDecoration: 'none' }}><IconMapPin size={13} /> Vào</a>
            )}
            {d.ra_lat != null && d.ra_lng != null && (
              <a href={linkBanDo(d.ra_lat, d.ra_lng)} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 3, font: 'var(--text-caption)', color: 'var(--text-brand)', fontWeight: 700, textDecoration: 'none' }}><IconMapPin size={13} /> Ra</a>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function ChiTietChamCa({ list }) {
  const [mo, setMo] = useState(false);
  const [soHien, setSoHien] = useState(SO_DONG_MOI_LAN);
  const soLuong = list?.length || 0;

  return (
    <div>
      <button
        onClick={() => setMo((v) => !v)}
        style={{
          width: '100%', minHeight: 44, borderRadius: 10, border: '1px solid var(--border-default)',
          background: 'var(--surface-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 12px', cursor: 'pointer', font: 'var(--text-body-sm)', fontWeight: 700, color: 'var(--text-primary)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconClock size={16} /> Chi tiết chấm ca {soLuong > 0 ? `(${soLuong})` : ''}</span>
        <span style={{ color: 'var(--text-secondary)' }}>{mo ? '▲ Thu gọn' : '▼ Xem'}</span>
      </button>

      {mo && (
        soLuong === 0 ? (
          <div style={{ marginTop: 8, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>Chưa có dữ liệu chấm công trong khoảng ngày này.</div>
        ) : (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.slice(0, soHien).map((d) => <DongChamCa key={d.id || `${d.work_date}-${d.vao}`} d={d} />)}
            {soHien < soLuong && (
              <button
                onClick={() => setSoHien((n) => n + SO_DONG_MOI_LAN)}
                style={{ minHeight: 40, borderRadius: 10, border: '1px dashed var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer' }}
              >Xem thêm {Math.min(soLuong - soHien, SO_DONG_MOI_LAN)} ngày</button>
            )}
          </div>
        )
      )}
    </div>
  );
}

function ChiTietNhanVien({ staffId, from, to }) {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [diem, setDiem] = useState(null);
  const [chamCa, setChamCa] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!staffId) return;
    let huy = false;
    setLoading(true); setError('');
    Promise.all([
      supabase.rpc('get_employee_kpi_overview', { p_staff_id: staffId, p_from: from, p_to: to }),
      supabase.rpc('compute_kpi_score', { p_staff_id: staffId, p_from: from, p_to: to }),
      supabase.rpc('get_staff_attendance_detail', { p_staff_id: staffId, p_from: from, p_to: to }),
    ]).then(([ov, sc, cc]) => {
      if (huy) return;
      if (ov.error) setError(ov.error.message || 'Không tải được KPI.');
      else setData(ov.data);
      setDiem(sc.data || null);
      setChamCa(cc.data || []);
    }).finally(() => { if (!huy) setLoading(false); });
    return () => { huy = true; };
  }, [staffId, from, to]);

  if (loading) return <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)' }}>Đang tải…</div>;
  if (error) return <div style={{ padding: 12, color: 'var(--status-danger)', display: 'flex', alignItems: 'center', gap: 6 }}><IconWarning size={16} /> {error}</div>;
  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <TheDiemKPI diem={diem} />

      <div style={{ font: 'var(--text-body-sm)', fontWeight: 700, color: 'var(--text-secondary)' }}>Dữ liệu tham khảo (chưa/không tính vào điểm tổng hợp)</div>

      <div>
        <TieuDeMuc Icon={IconClipboard}>Công việc</TieuDeMuc>
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
        <TieuDeMuc Icon={IconClock}>Giờ làm & Chuyên cần</TieuDeMuc>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <ThongKe label="Ngày làm việc" value={data.work_days ?? 0} />
          <ThongKe label="Tổng giờ làm" value={formatPhut(data.work_minutes)} />
          <ThongKe label="Tăng ca" value={formatPhut(data.overtime_minutes)} />
          <ThongKe label="Số lần đi trễ" value={data.late_count ?? 0} mau={data.late_count > 0 ? 'var(--status-danger)' : undefined} />
        </div>
        <div style={{ marginTop: 10 }}>
          <ChiTietChamCa list={chamCa} />
        </div>
      </div>

      {(data.output_quantity > 0 || data.leave_day_count > 0 || data.coworking_hours > 0) && (
        <div>
          <TieuDeMuc Icon={IconCake}>Sản xuất & phối hợp</TieuDeMuc>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {data.output_quantity > 0 && <ThongKe label="Sản lượng ghi nhận" value={data.output_quantity} />}
            {data.leave_day_count > 0 && <ThongKe label="Ngày nghỉ phép" value={data.leave_day_count} />}
            {data.coworking_hours > 0 && <ThongKe label="Làm cùng nhau" value={`${data.coworking_hours} giờ`} />}
          </div>
        </div>
      )}

      {data.shipper_order_count !== undefined && (
        <div>
          {/* Nguồn: delivery_runs/delivery_stops (Vận Chuyển V2) — đổi từ
              orders.shipper_staff_name (đã xác nhận 0 dữ liệu, không còn ai
              dùng) sang đúng luồng giao hàng đang chạy thật (10/09/2026). */}
          <TieuDeMuc Icon={IconTruck}>Giao hàng</TieuDeMuc>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <ThongKe label="Số đơn đã giao" value={data.shipper_order_count} />
            <ThongKe label="Quãng đường" value={`${data.shipper_total_km} km`} />
            <ThongKe label="Thời gian chạy chuyến" value={formatPhut(data.shipper_total_minutes)} />
            <ThongKe label="Đơn có ảnh chứng minh" value={`${data.shipper_orders_with_proof}/${data.shipper_order_count}`} />
          </div>
        </div>
      )}

      <div>
        {/* ⚠️ Đổi khung hiển thị (10/09/2026): KHÔNG hiện số âm/"tiền bị trừ"
            cho phần chưa đạt — tránh đọc như trừ lương (Điều 127 BLLĐ 2019
            cấm phạt tiền/cắt lương thay kỷ luật lao động). "Chưa đạt" chỉ là
            chưa đủ điều kiện nhận thưởng chuyên cần, không phải bị lấy lại
            tiền đã có. Dữ liệu gốc (staff_violations) vẫn giữ nguyên, chỉ
            đổi cách tổng hợp hiển thị ra đây.
            (11/09/2026: chuyển xuống dưới cùng theo yêu cầu sếp, đứng trên
            phần "Ghi nhận dữ liệu mới" — chỉ đổi thứ tự hiển thị, không đổi
            số liệu/logic tính.) */}
        <TieuDeMuc Icon={IconStar}>Thưởng chuyên cần (Gieo Hạt)</TieuDeMuc>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <ThongKe label="Được cộng" value={`+${data.star_cong_sao ?? 0} sao (${formatTien(data.star_cong_tien)})`} mau="var(--status-success)" />
          <ThongKe label="Chưa đạt (không trừ lương)" value={`-${data.star_chua_dat_sao ?? 0} sao`} mau="var(--status-danger)" />
        </div>
        <div style={{ ...cardStyle, marginTop: 8, textAlign: 'center' }}>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)' }}>Thưởng chuyên cần thực nhận</div>
          <div style={{ font: 'var(--text-display-md)', color: 'var(--status-success)' }}>
            +{data.star_rong_sao ?? 0} sao · {formatTien(data.star_rong_tien)}
          </div>
        </div>
      </div>

      <div>
        <TieuDeMuc Icon={IconSettings}>Ghi nhận dữ liệu mới (chưa tính điểm — đang gom dữ liệu)</TieuDeMuc>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <GhiNhanBanhLoi staffId={staffId} myId={profile?.id} tuKhai={staffId === profile?.id} />
          <GhiNhanKhieuNai staffId={staffId} myId={profile?.id} />
        </div>
      </div>
    </div>
  );
}

const HUY_HIEU_HANG = ['🥇', '🥈', '🥉'];

function DongNhanVien({ r, hang, onChonNhanVien }) {
  return (
    <button
      onClick={() => onChonNhanVien(r.staff_id, r.full_name)}
      style={{
        ...cardStyle, textAlign: 'left', cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', gap: 10,
        borderColor: hang <= 3 ? 'var(--status-success)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {hang <= 3 && <span style={{ fontSize: 22 }}>{HUY_HIEU_HANG[hang - 1]}</span>}
        <div>
          <div style={{ fontWeight: 700 }}>{r.full_name}</div>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)' }}>
            {r.completed_tasks} việc xong{r.late_count > 0 ? ` · ${r.late_count} lần trễ` : ''}
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        {/* Sao ròng đã kẹp sàn 0 ở RPC — không còn ca âm, bỏ nhánh màu đỏ. */}
        <div style={{ fontWeight: 800, color: 'var(--status-success)' }}>+{r.star_rong_sao} sao</div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)' }}>{formatTien(r.star_rong_tien)}</div>
      </div>
    </button>
  );
}

function BangXepHang({ from, to, onChonNhanVien }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Theo đề xuất bên ngoài (P7.2): chỉ "công khai" Top 3 mặc định — người
  // xếp cuối không nên bị bêu ngay khi mở màn ra, dễ khiến người ta nản/nghỉ
  // việc. Giám đốc vẫn xem được TẤT CẢ (họ là người quản lý, cần đủ dữ liệu),
  // chỉ cần bấm "Xem thêm" chủ động thay vì thấy ngay từ đầu.
  const [xemHet, setXemHet] = useState(false);

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
  if (error) return <div style={{ padding: 12, color: 'var(--status-danger)', display: 'flex', alignItems: 'center', gap: 6 }}><IconWarning size={16} /> {error}</div>;
  if (list.length === 0) return <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)' }}>Chưa có dữ liệu.</div>;

  const top3 = list.slice(0, 3);
  const conLai = list.slice(3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ font: 'var(--text-body-sm)', fontWeight: 700, color: 'var(--text-secondary)' }}>🏆 Top 3</div>
      {top3.map((r, i) => (
        <DongNhanVien key={r.staff_id} r={r} hang={i + 1} onChonNhanVien={onChonNhanVien} />
      ))}

      {conLai.length > 0 && !xemHet && (
        <button
          onClick={() => setXemHet(true)}
          style={{
            minHeight: 44, borderRadius: 12, border: '1px dashed var(--border-default)',
            background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer', marginTop: 6,
          }}
        >Xem thêm {conLai.length} người khác (chỉ giám đốc)</button>
      )}

      {xemHet && conLai.length > 0 && (
        <>
          <div style={{ font: 'var(--text-body-sm)', fontWeight: 700, color: 'var(--text-secondary)', marginTop: 6 }}>Còn lại</div>
          {conLai.map((r, i) => (
            <DongNhanVien key={r.staff_id} r={r} hang={i + 4} onChonNhanVien={onChonNhanVien} />
          ))}
        </>
      )}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--text-display-sm)', color: 'var(--text-primary)' }}><IconDashboard size={22} /> Tổng quan KPI</div>

      {/* Chế độ chạy bóng (10/09/2026, theo đề xuất chống gian lận/giữ niềm
          tin từ bên ngoài): số liệu KPI/thưởng chuyên cần hiện tại chỉ để
          THAM KHẢO, chưa có nơi nào trong app tự động trừ vào lương thật
          (fetchWagesSummaryForMonth không đọc star_transactions) — nói rõ
          điều này ra màn hình để không ai hiểu nhầm đây là số đã chốt. */}
      <div style={{
        padding: '10px 14px', borderRadius: 12, background: 'var(--surface-warning-soft, #fff3cd)',
        color: '#805000', font: 'var(--text-body-sm)', fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <IconWarning size={16} /> Đang chạy thử — số liệu này chưa dùng để tính thưởng/trừ lương chính thức. Thấy sai vui lòng báo lại.
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
