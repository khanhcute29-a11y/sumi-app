import { supabase } from './supabaseClient';

// HỒ SƠ NGÀY CỦA MỘT NHÂN SỰ — trả lời đúng câu hỏi của Giám đốc:
// "hôm nay người này làm được gì, nhận đơn nào, giao tới đâu, có trốn việc
// không?". Trước đây Dashboard chỉ có báo cáo gom theo LOẠI việc (việc hoàn
// thành, đơn hoàn thành…) nên không soi được theo TỪNG NGƯỜI, và nhân sự vận
// tải thì không thấy gì cả vì chuyến giao chưa từng được đưa vào báo cáo.
//
// ⚠️ TÁCH RIÊNG khỏi bossOverviewV3.js là CỐ Ý:
//  • loadAll() của Dashboard đã gánh 18 truy vấn chạy ngay lúc mở màn hình.
//    Các truy vấn ở file này chỉ chạy khi Giám đốc thật sự bấm mở tab "Theo
//    nhân sự" (danh sách) và bấm vào một người (chi tiết) — không làm nặng
//    thêm lần tải Dashboard.
//  • Mỗi nguồn dữ liệu chạy độc lập (Promise.allSettled): một bảng lỗi hoặc
//    bị RLS chặn thì các mục còn lại VẪN hiện, thay vì trắng cả bảng.

// Mốc đầu/cuối ngày theo giờ Việt Nam. Phải ghi rõ +07:00 — cột thời gian
// trong database là timestamptz, đưa chuỗi trần "2026-09-04T00:00:00" vào là
// Postgres hiểu thành giờ UTC, lệch 7 tiếng và cắt mất ca sáng sớm của bếp.
function khoangNgayVN(ngay) {
  return { tu: `${ngay}T00:00:00+07:00`, den: `${ngay}T23:59:59.999+07:00` };
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

// ── 2. Toàn bộ hoạt động trong NGÀY của MỘT người ───────────────────────────
export async function fetchHoSoNgayNhanSu({ staffId, station, ngay }) {
  const { tu, den } = khoangNgayVN(ngay);

  const [
    chamCongRes, mauChecklistRes, tickChecklistRes, viecRes,
    sanXuatRes, viPhamRes, chuyenGiaoRes,
  ] = await Promise.allSettled([
    supabase.from('shift_logs')
      .select('id, type, checkin_time, late_minutes, expected_start, shift_label, reason, photo_url')
      .eq('staff_id', staffId).eq('work_date', ngay).order('checkin_time'),

    supabase.from('task_templates').select('id, title, station, recurrence, weekdays, day_of_month')
      .eq('active', true),

    supabase.from('task_completions').select('template_id, completed_at, confirmed_at')
      .eq('staff_id', staffId).eq('date', ngay),

    // Việc được giao: lấy việc CÒN MỞ (đang phải làm) + việc đã xong trong
    // ngày. Chặn 60 ngày đổ lại để không quét cả bảng khi dữ liệu lớn dần.
    supabase.from('tasks')
      .select('id, title, status, category, deadline, accepted_at, completed_at, created_at, order_code')
      .eq('assignee_id', staffId).is('deleted_at', null)
      .in('category', ['assigned', 'adhoc', 'order_work'])
      .gte('created_at', new Date(new Date(`${ngay}T00:00:00+07:00`).getTime() - 60 * 86400000).toISOString())
      .order('created_at', { ascending: false }),

    supabase.from('finished_goods_stock_in_log')
      .select('id, product_name, size, qty, price, photo_url, created_at')
      .eq('staff_id', staffId).eq('work_date', ngay),

    supabase.from('staff_violations')
      .select('id, title, description, penalty_amount, so_sao, occurred_on')
      .eq('staff_id', staffId).eq('occurred_on', ngay),

    supabase.from('delivery_runs')
      .select('id, run_code, status, started_at, completed_at, distance_km, provider_label, vehicle_type')
      .eq('assigned_driver_id', staffId).gte('created_at', tu).lte('created_at', den)
      .order('created_at'),
  ]);

  const chamCong = layDs(chamCongRes);
  const tick = layDs(tickChecklistRes);
  const chuyenGiao = layDs(chuyenGiaoRes);

  // Checklist áp cho người này: mục của ĐÚNG khâu họ đang đứng, cộng các mục
  // dùng chung (station trống). Lọc theo lịch lặp giống hệt màn Checklist.
  const thu = new Date(`${ngay}T12:00:00`).getDay();
  const ngayTrongThang = Number(ngay.slice(-2));
  const checklist = layDs(mauChecklistRes)
    .filter((t) => !t.station || t.station === station)
    .filter((t) => (t.recurrence === 'weekly' ? (t.weekdays || []).includes(thu)
      : t.recurrence === 'monthly' ? Number(t.day_of_month) === ngayTrongThang
        : true))
    .map((t) => {
      const c = tick.find((x) => x.template_id === t.id);
      return { id: t.id, title: t.title, xong: !!c?.completed_at, daDuyet: !!c?.confirmed_at };
    });

  // Việc: chia 2 nhóm cho Giám đốc nhìn phát ra ngay ai đang ôm việc dở.
  const trongNgay = (iso) => !!iso && iso >= tu && iso <= den;
  const viecTatCa = layDs(viecRes);
  const viec = {
    dangLam: viecTatCa.filter((t) => !['done', 'exempted'].includes(t.status)),
    xongTrongNgay: viecTatCa.filter((t) => t.status === 'done' && trongNgay(t.completed_at)),
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

  // Đơn bếp người này nhận/làm xong trong ngày. Tách riêng khỏi Promise.all ở
  // trên vì cần .or() 3 cột người phụ trách (nhận, được giao, hoàn thành).
  let donBep = [];
  try {
    const res = await supabase.from('order_work_packages')
      .select('id, status, assigned_at, accepted_at, completed_at, due_at, is_collaborative, orders(order_code, order_type, required_at, status_v2)')
      .or(`accepted_by.eq.${staffId},assigned_to_staff_id.eq.${staffId},completed_by_staff_id.eq.${staffId}`)
      .gte('assigned_at', new Date(new Date(tu).getTime() - 3 * 86400000).toISOString());
    if (!res.error) {
      donBep = (res.data || []).filter((p) =>
        trongNgay(p.accepted_at) || trongNgay(p.completed_at) || trongNgay(p.assigned_at)
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

// Người này cả ngày KHÔNG để lại dấu vết nào — đúng thứ Giám đốc muốn soi.
export function khongCoHoatDong(hs) {
  if (!hs) return false;
  return !hs.chamCong.length
    && !hs.viec.dangLam.length && !hs.viec.xongTrongNgay.length
    && !hs.donBep.length && !hs.sanXuat.length && !hs.vanTai.length
    && !hs.checklist.some((c) => c.xong);
}
