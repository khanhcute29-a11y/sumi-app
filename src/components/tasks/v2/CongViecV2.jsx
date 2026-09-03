import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { fetchQuyDinhCa } from '../../../lib/queries';
import { chuanHoaCa } from '../../../lib/chamCong';
import ViecNhanVien from './ViecNhanVien';
import ViecQuanLy from './ViecQuanLy';
import ViecGiamDoc from './ViecGiamDoc';
import GiaoViecModal from './GiaoViecModal';
import { nhomViecNhanVien } from '../../../lib/congViec';
import '../../../styles/cong-viec.css';

// Cửa ngõ của phân hệ Công việc: tự chọn góc nhìn theo vai trò người đăng nhập,
// và lo phần tải dữ liệu cho cả ba màn hình.
//
// NGUYÊN TẮC XỬ LÝ LỖI: mọi lần gọi database đều bọc try/catch và chỉ set biến
// `loi`. Không bao giờ ném lỗi ra ngoài — hỏng mạng thì màn hình vẫn đứng vững
// và báo cho người dùng biết, thay vì trắng bảng.

const GIOI_HAN = 300;   // không kéo cả bảng về máy

export default function CongViecV2({ profile, staffList = [], onMetrics }) {
  const [tasks, setTasks] = useState([]);
  const [duAn, setDuAn] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [moGiaoViec, setMoGiaoViec] = useState(false);

  // Vai trò do DATABASE quyết, không đoán từ `profiles.role`/`station`.
  // Hai cột đó không khớp sơ đồ tổ chức: một bếp trưởng đang được ghi là
  // role='sale', còn `station` thì gần như cả tiệm bỏ trống. Hàm
  // `sumi_vai_tro_cong_viec` đọc đúng nguồn mà hàng rào RLS đang dùng, nên góc
  // nhìn trên màn hình luôn khớp với dữ liệu người đó thật sự đọc được.
  const [vaiTro, setVaiTro] = useState(null);
  useEffect(() => {
    if (!profile?.id) return;
    let huy = false;
    supabase.rpc('sumi_vai_tro_cong_viec')
      .then(({ data, error }) => { if (!huy) setVaiTro(error ? {} : (data || {})); })
      .catch(() => { if (!huy) setVaiTro({}); });
    return () => { huy = true; };
  }, [profile?.id]);

  const laGiamDoc = !!vaiTro?.la_giam_doc;
  const laQuanLy = !!vaiTro?.la_quan_ly;

  const tenTheoId = {};
  (staffList || []).forEach((p) => { tenTheoId[p.id] = p.full_name; });
  if (profile?.id) tenTheoId[profile.id] = profile.full_name || 'Tôi';

  const tai = useCallback(async () => {
    setDangTai(true);
    try {
      // KHÔNG tự lọc theo khâu ở đây nữa.
      //
      // Trước đây tôi lọc `.or('station_id.eq...')` — sai hai lần: cột đó rỗng
      // trên toàn bộ việc cũ, và quan trọng hơn, HÀNG RÀO RLS DƯỚI DATABASE MỚI
      // LÀ NƠI QUYẾT ai thấy gì. Lọc thêm ở đây chỉ cắt bớt một cách sai lệch.
      //   Giám đốc  -> thấy toàn xưởng
      //   Bếp trưởng -> thấy việc của người cùng đơn vị (chính sách mới)
      //   Thợ       -> chỉ thấy việc của mình
      const q = supabase.from('tasks').select('*')
        .in('category', ['assigned', 'adhoc'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(GIOI_HAN);

      const { data, error } = await q;
      if (error) throw error;
      setTasks(data || []);
      setLoi('');
    } catch (e) {
      // Không để màn hình trắng: giữ danh sách cũ, chỉ báo lỗi lên đầu trang.
      setLoi(e?.message || 'Không kết nối được máy chủ.');
    } finally {
      setDangTai(false);
    }
  }, [profile?.id]);

  useEffect(() => { if (profile?.id) tai(); }, [profile?.id, tai]);

  // Ca quy định — CHỈ để tính "việc này có rơi ngoài giờ làm của người được
  // giao không" (xem lib/chamCong.viecNgoaiGioLamViec), phục vụ nút "Từ chối"
  // ở TheViecNhanVien. Tải một lần, không phải mỗi khi tasks đổi.
  const [danhSachCa, setDanhSachCa] = useState([]);
  useEffect(() => {
    fetchQuyDinhCa().then((rows) => setDanhSachCa(chuanHoaCa(rows))).catch(() => setDanhSachCa([]));
  }, []);

  // Số liệu nhỏ cho hero-metrics ở khung ngoài (TasksScreen.jsx) — dùng chung
  // một lần tải `tasks` ở đây, không mở thêm truy vấn riêng chỉ để đếm.
  //
  // ⚠️ LỖI THẬT đã vá: trước đây "Đang làm" tự đếm status==='accepted', LỆCH
  // với đúng cách nhomViecNhanVien() (nguồn thật cho khối "Đang làm" hiển thị
  // bên dưới) tính — nhomViecNhanVien còn gộp cả case status==='open' nhưng đã
  // có accepted_at. Số trên hero có thể ít hơn số thực tế thợ thấy trong danh
  // sách của chính họ. Dùng thẳng nhomViecNhanVien() để không bao giờ lệch.
  useEffect(() => {
    if (!onMetrics) return;
    const homNay = new Date().toDateString();
    const nhom = nhomViecNhanVien(tasks);
    onMetrics({
      dangLam: nhom.dangLam.length,
      choDuyet: nhom.choDuyet.length,
      xongHomNay: nhom.daXong.filter((t) => t.completed_at && new Date(t.completed_at).toDateString() === homNay).length,
    });
  }, [tasks, onMetrics]);

  // Dự án chỉ cần cho Giám đốc. Bảng có thể chưa tạo (migration chưa chạy) —
  // trường hợp đó coi như không có dự án nào, KHÔNG làm hỏng cả màn hình.
  const taiDuAn = useCallback(() => {
    if (!laGiamDoc) return;
    supabase.from('projects').select('*').eq('status', 'dang_chay').order('created_at', { ascending: false })
      .then(({ data, error }) => setDuAn(error ? [] : (data || [])))
      .catch(() => setDuAn([]));
  }, [laGiamDoc]);

  useEffect(() => { taiDuAn(); }, [taiDuAn]);

  // Có ai đổi việc/dự án là danh sách tự cập nhật. Kênh riêng để không đụng
  // kênh 'tasks-live' mà màn hình cha đang dùng.
  //
  // ⚠️ SỬA LỖI THẬT: kênh này đã tồn tại từ trước nhưng KHÔNG bao giờ nhận
  // được sự kiện, vì bảng `tasks` chưa từng được thêm vào publication
  // `supabase_realtime` dưới database (chỉ có chat_messages và
  // task_progress_reports được bật đúng cách). Danh sách vẫn "tự cập nhật"
  // trước giờ là nhờ mỗi màn hình tự gọi lại `tai()` NGAY SAU RPC của chính
  // nó thành công — người khác đang mở sẵn tab thì không thấy gì cho tới
  // khi tự tải lại. Xem migration 202608270060 để bật đúng ở phía database.
  useEffect(() => {
    const kenh = supabase.channel('cong-viec-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => tai())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => taiDuAn())
      .subscribe();
    return () => { supabase.removeChannel(kenh); };
  }, [tai, taiDuAn]);

  const nhacNho = async (viec) => {
    const { data, error } = await supabase.rpc('sumi_nhac_nho_viec', {
      p_task_id: viec.id, p_loi_nhan: null,
    });
    if (error) throw error;
    if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không gửi được lời nhắc.');
    await tai();
  };

  const chung = { tasks, tenTheoId, dangTai, loi, onTaiLai: tai, danhSachCa };

  if (laGiamDoc) {
    return (
      <div className="cv-wrap">
        <ViecGiamDoc {...chung} duAn={duAn} hoSo={profile}
          onMoGiaoViec={() => setMoGiaoViec(true)}
          onMoTaoDuAn={() => setMoGiaoViec(true)} onNhacNho={nhacNho} />
        {moGiaoViec && (
          <GiaoViecModal hoSo={profile} danhSachTho={staffList}
            onClose={() => setMoGiaoViec(false)}
            onXong={async () => { setMoGiaoViec(false); await tai(); }} />
        )}
      </div>
    );
  }

  if (laQuanLy) {
    return (
      <div className="cv-wrap">
        <ViecQuanLy {...chung} hoSo={profile} danhSachTho={staffList}
          onMoGiaoViec={() => setMoGiaoViec(true)} />
        {moGiaoViec && (
          <GiaoViecModal hoSo={profile} danhSachTho={staffList}
            onClose={() => setMoGiaoViec(false)}
            onXong={async () => { setMoGiaoViec(false); await tai(); }} />
        )}
      </div>
    );
  }

  return (
    <div className="cv-wrap">
      <ViecNhanVien {...chung} hoSo={profile} />
    </div>
  );
}
