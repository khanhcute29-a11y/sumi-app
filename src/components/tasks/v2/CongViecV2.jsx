import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import ViecNhanVien from './ViecNhanVien';
import ViecQuanLy from './ViecQuanLy';
import ViecGiamDoc from './ViecGiamDoc';
import '../../../styles/cong-viec.css';

// Cửa ngõ của phân hệ Công việc: tự chọn góc nhìn theo vai trò người đăng nhập,
// và lo phần tải dữ liệu cho cả ba màn hình.
//
// NGUYÊN TẮC XỬ LÝ LỖI: mọi lần gọi database đều bọc try/catch và chỉ set biến
// `loi`. Không bao giờ ném lỗi ra ngoài — hỏng mạng thì màn hình vẫn đứng vững
// và báo cho người dùng biết, thay vì trắng bảng.

const GIOI_HAN = 300;   // không kéo cả bảng về máy

export default function CongViecV2({ profile, staffList = [], onMoGiaoViec }) {
  const [tasks, setTasks] = useState([]);
  const [duAn, setDuAn] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');

  const vaiTro = [profile?.role, ...(profile?.extra_roles || [])].filter(Boolean);
  const laGiamDoc = vaiTro.some((r) => ['owner', 'admin'].includes(r));
  const khauQuanLy = vaiTro.includes('deputy_director_x41') ? 'xuong41'
    : vaiTro.includes('deputy_director_x42') ? 'xuong42'
      : vaiTro.some((r) => String(r).startsWith('kitchen_lead')) ? ((profile?.station || '').trim() || null)
        : null;
  const laQuanLy = !laGiamDoc && (khauQuanLy !== null || vaiTro.some((r) => String(r).startsWith('kitchen_lead')));

  const tenTheoId = {};
  (staffList || []).forEach((p) => { tenTheoId[p.id] = p.full_name; });
  if (profile?.id) tenTheoId[profile.id] = profile.full_name || 'Tôi';

  const tai = useCallback(async () => {
    setDangTai(true);
    try {
      let q = supabase.from('tasks').select('*')
        .in('category', ['assigned', 'adhoc'])
        .order('created_at', { ascending: false })
        .limit(GIOI_HAN);

      if (laGiamDoc) {
        // Giám đốc thấy toàn xưởng.
      } else if (laQuanLy && khauQuanLy) {
        // Bếp trưởng: việc của khâu mình, cộng việc mình giao hoặc mình làm.
        q = q.or(`station_id.eq.${khauQuanLy},assignee_id.eq.${profile?.id},created_by.eq.${profile?.id}`);
      } else if (laQuanLy) {
        // Bếp trưởng chưa gán khâu: chỉ thấy việc mình giao hoặc mình làm.
        q = q.or(`assignee_id.eq.${profile?.id},created_by.eq.${profile?.id}`);
      } else {
        q = q.eq('assignee_id', profile?.id);
      }

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
  }, [laGiamDoc, laQuanLy, khauQuanLy, profile?.id]);

  useEffect(() => { if (profile?.id) tai(); }, [profile?.id, tai]);

  // Dự án chỉ cần cho Giám đốc. Bảng có thể chưa tạo (migration chưa chạy) —
  // trường hợp đó coi như không có dự án nào, KHÔNG làm hỏng cả màn hình.
  useEffect(() => {
    if (!laGiamDoc) return;
    let huy = false;
    supabase.from('projects').select('*').eq('status', 'dang_chay').order('created_at', { ascending: false })
      .then(({ data, error }) => { if (!huy) setDuAn(error ? [] : (data || [])); })
      .catch(() => { if (!huy) setDuAn([]); });
    return () => { huy = true; };
  }, [laGiamDoc]);

  // Có ai đổi việc là danh sách tự cập nhật. Kênh riêng để không đụng kênh
  // 'tasks-live' mà màn hình cha đang dùng.
  useEffect(() => {
    const kenh = supabase.channel('cong-viec-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => tai())
      .subscribe();
    return () => { supabase.removeChannel(kenh); };
  }, [tai]);

  const nhacNho = async (viec) => {
    const { data, error } = await supabase.rpc('sumi_nhac_nho_viec', {
      p_task_id: viec.id, p_loi_nhan: null,
    });
    if (error) throw error;
    if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không gửi được lời nhắc.');
    await tai();
  };

  const chung = { tasks, tenTheoId, dangTai, loi, onTaiLai: tai };

  if (laGiamDoc) {
    return (
      <div className="cv-wrap">
        <ViecGiamDoc {...chung} duAn={duAn}
          onMoGiaoViec={onMoGiaoViec} onMoTaoDuAn={onMoGiaoViec} onNhacNho={nhacNho} />
      </div>
    );
  }

  if (laQuanLy) {
    return (
      <div className="cv-wrap">
        <ViecQuanLy {...chung} hoSo={profile} danhSachTho={staffList} onMoGiaoViec={onMoGiaoViec} />
      </div>
    );
  }

  return (
    <div className="cv-wrap">
      <ViecNhanVien {...chung} hoSo={profile} />
    </div>
  );
}
