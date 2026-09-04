import { supabase } from './supabaseClient';

// HỒ SƠ NGÀY CỦA MỘT NHÂN SỰ — trả lời đúng câu hỏi của Giám đốc:
// "hôm nay/khoảng này người này làm được gì, nhận đơn nào, giao tới đâu, có
// trốn việc không?". Trước đây Dashboard chỉ có báo cáo gom theo LOẠI việc
// (việc hoàn thành, đơn hoàn thành…) nên không soi được theo TỪNG NGƯỜI, và
// nhân sự vận tải thì không thấy gì cả vì chuyến giao chưa từng được đưa vào
// báo cáo.
//
// ⚠️ TÁCH RIÊNG khỏi bossOverviewV3.js là CỐ Ý:
//  • loadAll() của Dashboard đã gánh 18 truy vấn chạy ngay lúc mở màn hình.
//    Các truy vấn ở file này chỉ chạy khi Giám đốc thật sự bấm mở sheet Báo
//    Cáo Ngày (danh sách theo bộ phận) và bấm vào một người (chi tiết) —
//    không làm nặng thêm lần tải Dashboard.
//  • Mỗi nguồn dữ liệu chạy độc lập (Promise.allSettled): một bảng lỗi hoặc
//    bị RLS chặn thì các mục còn lại VẪN hiện, thay vì trắng cả bảng.

// Mốc đầu/cuối NGÀY theo giờ Việt Nam. Phải ghi rõ +07:00 — cột thời gian
// trong database là timestamptz, đưa chuỗi trần "2026-09-04T00:00:00" vào là
// Postgres hiểu thành giờ UTC, lệch 7 tiếng và cắt mất ca sáng sớm của bếp.
function khoangNgayVN(ngay) {
  return { tu: `${ngay}T00:00:00+07:00`, den: `${ngay}T23:59:59.999+07:00` };
}

// Mốc đầu/cuối một KHOẢNG ngày (Từ ngày - Đến ngày, dùng cho tab Lịch sử).
function khoangNhieuNgayVN(tuNgay, denNgay) {
  return { tu: `${tuNgay}T00:00:00+07:00`, den: `${denNgay}T23:59:59.999+07:00` };
}

const layDs = (kq) => (kq.status === 'fulfilled' ? (kq.value.data || []) : []);

// ── 1. Danh sách nhân sự + trạng thái chấm công của NGÀY đang xem ───────────
// KHÁC fetchTodayStaffStatus() của Dashboard: hàm đó BỎ QUA người không có
// bản ghi chấm công nào trong ngày, mà đó lại đúng là nhóm Giám đốc cần soi
// (chưa chấm công / không thấy làm gì). Ở đây giữ lại TOÀN BỘ nhân sự, ai
// không có dữ liệu thì hiện rõ "Chưa chấm công".
export async function fetchDanhSachNhanSuNgay(ngay) {
  const [hoSoRes, logRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, station, extra_roles')
      .eq('approved', true).neq('active', false).order('full_name'),
    supabase.from('shift_logs').select('staff_id, type, checkin_time, late_minutes, shift_label')
      .eq('work_date', ngay),
  ]);
  if (hoSoRes.error) throw hoSoRes.error;
  const logs = logRes.error ? [] : (logRes.data || []);

  return (hoSoRes.data || []).map((p) => {
    const cua = logs.filter((l) => l.staff_id === p.id);
    const vao = cua.filter((l) => l.type === 'checkin')
      .sort((a, b) => new Date(a.checkin_time) - new Date(b.checkin_time))[0];
    const ra = cua.filter((l) => l.type === 'checkout')
      .sort((a, b) => new Date(b.checkin_time) - new Date(a.checkin_time))[0];
    const xinNghi = cua.some((l) => l.type === 'leave_request');
    return {
      ...p,
      gioVao: vao?.checkin_time || null,
      gioRa: ra?.checkin_time || null,
      phutMuon: vao?.late_minutes || 0,
      xinNghi,
      trangThai: xinNghi ? 'nghi' : !vao ? 'chua_cham' : ra ? 'xong' : 'dang_lam',
    };
  });
}

// ── 1b. Danh sách nhân sự + TÓM TẮT chấm công của cả KHOẢNG ngày (Lịch sử) ──
export async function fetchDanhSachNhanSuKhoangNgay(tuNgay, denNgay) {
  const [hoSoRes, logRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, station, extra_roles')
      .eq('approved', true).neq('active', false).order('full_name'),
    supabase.from('shift_logs').select('staff_id, type, work_date, late_minutes')
      .gte('work_date', tuNgay).lte('work_date', denNgay),
  ]);
  if (hoSoRes.error) throw hoSoRes.error;
  const logs = logRes.error ? [] : (logRes.data || []);

  return (hoSoRes.data || []).map((p) => {
    const cua = logs.filter((l) => l.staff_id === p.id);
    const ngayCoMat = new Set(cua.filter((l) => l.type === 'checkin').map((l) => l.work_date));
    const ngayXinNghi = new Set(cua.filter((l) => l.type === 'leave_request').map((l) => l.work_date));
    const soLanTre = cua.filter((l) => l.type === 'checkin' && (l.late_minutes || 0) > 0).length;
    return {
      ...p,
      soNgayCoMat: ngayCoMat.size,
      soNgayXinNghi: ngayXinNghi.size,
      soLanTre,
      trangThai: ngayCoMat.size === 0 && ngayXinNghi.size === 0 ? 'khong_hoat_dong' : 'binh_thuong',
    };
  });
}

// Gắn order_id thật vào từng "việc" có work_package_id (việc phát sinh từ
// đơn hàng) — để màn chi tiết mở thẳng được đúng đơn khi bấm vào, không chỉ
// hiện order_code dạng chữ tĩnh. Tasks không gắn work_package_id (assigned/
// adhoc thường) thì giữ nguyên, không có gì để mở thêm.
async function ganOrderIdChoViec(viecList) {
  const wpIds = [...new Set(viecList.filter((t) => t.work_package_id).map((t) => t.work_package_id))];
  if (!wpIds.length) return viecList;
  const { data } = await supabase.from('order_work_packages').select('id, order_id').in('id', wpIds);
  const map = new Map((data || []).map((w) => [w.id, w.order_id]));
  return viecList.map((t) => ({ ...t, orderIdThat: t.work_package_id ? map.get(t.work_package_id) || null : null }));
}

// ── 2. Toàn bộ hoạt động trong NGÀY (hoặc KHOẢNG ngày) của MỘT người ────────
// truyền `ngay` cho 1 ngày (tab Hôm nay), hoặc `tuNgay`+`denNgay` cho cả
// khoảng (tab Lịch sử) — cùng 1 hàm, tránh viết trùng logic 2 lần.
export async function fetchHoSoNgayNhanSu({ staffId, station, ngay, tuNgay, denNgay }) {
  const { tu, den } = ngay ? khoangNgayVN(ngay) : khoangNhieuNgayVN(tuNgay, denNgay);
  const ngayBatDauChecklist = ngay || tuNgay;
  const ngayKetThucChecklist = ngay || denNgay;

  const [
    chamCongRes, mauChecklistRes, tickChecklistRes, viecRes,
    sanXuatRes, viPhamRes, chuyenGiaoRes,
  ] = await Promise.allSettled([
    supabase.from('shift_logs')
      .select('id, type, checkin_time, work_date, late_minutes, expected_start, shift_label, reason, photo_url')
      .eq('staff_id', staffId).gte('work_date', ngayBatDauChecklist).lte('work_date', ngayKetThucChecklist)
      .order('checkin_time'),

    supabase.from('task_templates').select('id, title, station, recurrence, weekdays, day_of_month')
      .eq('active', true),

    supabase.from('task_completions').select('template_id, date, completed_at, confirmed_at')
      .eq('staff_id', staffId).gte('date', ngayBatDauChecklist).lte('date', ngayKetThucChecklist),

    // Việc được giao: lấy việc CÒN MỞ (đang phải làm) + việc đã xong trong
    // khoảng. Chặn 60 ngày trước mốc bắt đầu để không quét cả bảng khi dữ
    // liệu lớn dần.
    supabase.from('tasks')
      .select('id, title, status, category, deadline, accepted_at, completed_at, created_at, order_code, work_package_id')
      .eq('assignee_id', staffId).is('deleted_at', null)
      .in('category', ['assigned', 'adhoc', 'order_work'])
      .gte('created_at', new Date(new Date(`${ngayBatDauChecklist}T00:00:00+07:00`).getTime() - 60 * 86400000).toISOString())
      .order('created_at', { ascending: false }),

    // ⚠️ ĐÚNG bảng là `production_logs` (có staff_id + work_date + price) —
    // KHÔNG phải finished_goods_stock_in_log (bảng đó không có 3 cột này, hỏi
    // sai là Supabase trả lỗi và mục "Nhập kho thành phẩm" im lặng rỗng).
    supabase.from('production_logs')
      .select('id, product_name, size, qty, price, photo_url, created_at, work_date')
      .eq('staff_id', staffId).gte('work_date', ngayBatDauChecklist).lte('work_date', ngayKetThucChecklist),

    supabase.from('staff_violations')
      .select('id, title, description, penalty_amount, so_sao, occurred_on')
      .eq('staff_id', staffId).gte('occurred_on', ngayBatDauChecklist).lte('occurred_on', ngayKetThucChecklist),

    supabase.from('delivery_runs')
      .select('id, run_code, status, started_at, completed_at, distance_km, provider_label, vehicle_type')
      .eq('assigned_driver_id', staffId).gte('created_at', tu).lte('created_at', den)
      .order('created_at'),
  ]);

  const chamCong = layDs(chamCongRes);
  const tick = layDs(tickChecklistRes);
  const chuyenGiao = layDs(chuyenGiaoRes);

  // Checklist: LOẠI 1 ngày (Hôm nay) — danh sách mục + đã tick hay chưa.
  // KHOẢNG nhiều ngày (Lịch sử) — cộng tổng số LƯỢT áp dụng và số lượt đã
  // hoàn thành trên toàn khoảng (mỗi ngày mỗi mục là 1 lượt).
  let checklist;
  if (ngay) {
    const thu = new Date(`${ngay}T12:00:00`).getDay();
    const ngayTrongThang = Number(ngay.slice(-2));
    checklist = layDs(mauChecklistRes)
      .filter((t) => !t.station || t.station === station)
      .filter((t) => (t.recurrence === 'weekly' ? (t.weekdays || []).includes(thu)
        : t.recurrence === 'monthly' ? Number(t.day_of_month) === ngayTrongThang
          : true))
      .map((t) => {
        const c = tick.find((x) => x.template_id === t.id);
        return { id: t.id, title: t.title, xong: !!c?.completed_at, daDuyet: !!c?.confirmed_at };
      });
  } else {
    const mauApDung = layDs(mauChecklistRes).filter((t) => !t.station || t.station === station);
    let luotApDung = 0;
    let luotXong = 0;
    for (let d = new Date(`${tuNgay}T12:00:00`); d <= new Date(`${denNgay}T12:00:00`); d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const thu = d.getDay();
      const ngayTrongThang = d.getDate();
      mauApDung.forEach((t) => {
        const apDung = t.recurrence === 'weekly' ? (t.weekdays || []).includes(thu)
          : t.recurrence === 'monthly' ? Number(t.day_of_month) === ngayTrongThang
            : true;
        if (!apDung) return;
        luotApDung += 1;
        if (tick.some((x) => x.template_id === t.id && x.date === iso && x.completed_at)) luotXong += 1;
      });
    }
    checklist = { kieu: 'khoang', luotApDung, luotXong };
  }

  // Việc: chia 2 nhóm cho Giám đốc nhìn phát ra ngay ai đang ôm việc dở.
  const trongKhoang = (iso) => !!iso && iso >= tu && iso <= den;
  const viecTatCa = await ganOrderIdChoViec(layDs(viecRes));
  const viec = {
    dangLam: viecTatCa.filter((t) => !['done', 'exempted'].includes(t.status)),
    xongTrongNgay: viecTatCa.filter((t) => t.status === 'done' && trongKhoang(t.completed_at)),
  };

  // Điểm dừng của các chuyến giao — đây là phần Giám đốc đang thiếu hoàn
  // toàn: giao đơn nào, tới đâu, đã giao hay chưa.
  let diemDung = [];
  if (chuyenGiao.length) {
    const res = await supabase.from('delivery_stops')
      .select('id, delivery_run_id, order_id, sequence_no, status, arrived_at, delivered_at, destination_address, failure_reason, photo_proof_url, orders(order_code, customer_id, required_at)')
      .in('delivery_run_id', chuyenGiao.map((r) => r.id))
      .order('sequence_no');
    if (!res.error) diemDung = res.data || [];
  }

  // Đơn bếp người này nhận/làm xong trong khoảng. Tách riêng khỏi
  // Promise.all ở trên vì cần .or() 3 cột người phụ trách (nhận, được giao,
  // hoàn thành).
  let donBep = [];
  try {
    const res = await supabase.from('order_work_packages')
      .select('id, order_id, status, assigned_at, accepted_at, completed_at, due_at, is_collaborative, orders(order_code, order_type, required_at, status_v2)')
      .or(`accepted_by.eq.${staffId},assigned_to_staff_id.eq.${staffId},completed_by_staff_id.eq.${staffId}`)
      .gte('assigned_at', new Date(new Date(tu).getTime() - 3 * 86400000).toISOString());
    if (!res.error) {
      donBep = (res.data || []).filter((p) =>
        trongKhoang(p.accepted_at) || trongKhoang(p.completed_at) || trongKhoang(p.assigned_at)
        || (!p.completed_at && p.status !== 'cancelled'));
    }
  } catch { donBep = []; }

  return {
    chamCong,
    checklist,
    viec,
    donBep,
    sanXuat: layDs(sanXuatRes),
    viPham: layDs(viPhamRes),
    vanTai: chuyenGiao.map((r) => ({
      ...r,
      diemDung: diemDung.filter((s) => s.delivery_run_id === r.id),
    })),
  };
}

// ── 3. Trạng thái LÀM VIỆC THỰC TẾ theo task/đơn hàng đang xử lý — KHÁC
// trạng thái chấm công ở mục 1 (có mặt hay không). Trả lời "người này NGAY
// LÚC NÀY đang làm đơn nào/chuyến nào/việc gì", dùng cho module "Trạng Thái"
// trên Dashboard Giám đốc. 4 truy vấn ĐỘC LẬP với số lượng nhân sự (không
// N+1 theo từng người) để không nghẽn khi công ty đông nhân sự.
export async function fetchStaffLiveStatusList() {
  const [hoSoRes, donBepRes, vanTaiRes, viecRes] = await Promise.allSettled([
    supabase.from('profiles').select('id, full_name, role, station, extra_roles')
      .eq('approved', true).neq('active', false).order('full_name'),

    // Đơn bếp đang mở (chưa xong/chưa huỷ) — người ĐANG LÀM là accepted_by,
    // người ĐƯỢC GIAO (có thể chưa nhận) là assigned_to_staff_id.
    supabase.from('order_work_packages')
      .select('accepted_by, assigned_to_staff_id, status, order_id, orders(order_code)')
      .not('status', 'in', '(completed,cancelled)'),

    // Chuyến giao đã nhận hoặc đang trên đường — chưa hoàn thành.
    supabase.from('delivery_runs')
      .select('assigned_driver_id, status, run_code')
      .in('status', ['accepted', 'in_transit']),

    // Việc thường không gắn đơn hàng còn mở — để các khâu không phải bếp/vận
    // tải (thủ kho, quản lý...) vẫn có trạng thái thật thay vì mặc định.
    supabase.from('tasks').select('assignee_id, status, title')
      .is('deleted_at', null)
      .not('status', 'in', '(done,exempted,cancelled)'),
  ]);

  const hoSo = layDs(hoSoRes);
  const donBep = layDs(donBepRes);
  const vanTai = layDs(vanTaiRes);
  const viec = layDs(viecRes);

  return hoSo.map((p) => {
    const donCuaToi = donBep.find((d) => d.accepted_by === p.id || d.assigned_to_staff_id === p.id);
    if (donCuaToi) {
      const ma = donCuaToi.orders?.order_code;
      return { ...p, trangThaiLam: 'don_hang', nhanTrangThai: ma ? `Đang làm đơn ${ma}` : 'Đang làm đơn hàng' };
    }
    const chuyenCuaToi = vanTai.find((r) => r.assigned_driver_id === p.id);
    if (chuyenCuaToi) {
      return { ...p, trangThaiLam: 'van_chuyen', nhanTrangThai: chuyenCuaToi.run_code ? `Đang vận chuyển (${chuyenCuaToi.run_code})` : 'Đang vận chuyển đơn hàng' };
    }
    const viecCuaToi = viec.find((t) => t.assignee_id === p.id);
    if (viecCuaToi) {
      return { ...p, trangThaiLam: 'viec', nhanTrangThai: `Đang làm: ${viecCuaToi.title}` };
    }
    return { ...p, trangThaiLam: 'trong', nhanTrangThai: 'Chưa có việc cụ thể' };
  });
}

// Người này cả ngày/khoảng KHÔNG để lại dấu vết nào — đúng thứ Giám đốc muốn soi.
export function khongCoHoatDong(hs) {
  if (!hs) return false;
  const checklistXong = hs.checklist?.kieu === 'khoang' ? hs.checklist.luotXong > 0 : hs.checklist.some((c) => c.xong);
  return !hs.chamCong.length
    && !hs.viec.dangLam.length && !hs.viec.xongTrongNgay.length
    && !hs.donBep.length && !hs.sanXuat.length && !hs.vanTai.length
    && !checklistXong;
}
