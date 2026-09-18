import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchMyProfile } from './queries';
import { hasPermission, hasAnyPermission, canAccessRole } from './permissions';
import { supabase } from './supabaseClient';

const AuthContext = createContext({
  profile: null,
  loading: true,
  reload: () => {},
  can: () => false,
  canAny: () => false,
  canAccess: () => false,
});

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // LỖI THẬT đã vá (báo lại 18/9/2026, ảnh chụp thật "Chưa đăng nhập." dù
  // đang đăng nhập bình thường): trước đây MỌI lỗi khi tải hồ sơ - kể cả
  // lỗi mạng/API chập chờn thoáng qua (rất hay gặp trên di động khi đổi
  // Wi-Fi/4G) - đều bị coi NGANG HÀNG với "hết phiên đăng nhập", xoá thẳng
  // profile về null. Các màn Tổng quan (BossOverviewV3/EmployeeOverviewV4/
  // AccountantOverviewV1) thấy profile null liền hiện "Chưa đăng nhập."
  // dù session thật (App.jsx quản lý riêng, xem AuthGate) vẫn còn nguyên -
  // chỉ cần tải lại trang là vào lại được ngay, gây hoang mang tưởng bị
  // đăng xuất. Giờ khi tải hồ sơ lỗi, kiểm tra lại session thật trước:
  // còn session thì thử lại 1 lần (bù lỗi mạng thoáng qua) và GIỮ NGUYÊN
  // profile cũ nếu thử lại vẫn lỗi, chỉ xoá profile khi chắc chắn không
  // còn phiên đăng nhập nào.
  const load = () => {
    setLoading(true);
    fetchMyProfile()
      .then((p) => { setProfile(p); setLoading(false); })
      .catch(async (err) => {
        console.error('[AuthContext] Tải hồ sơ lần đầu thất bại:', err);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setProfile(null);
          setLoading(false);
          return;
        }
        try {
          setProfile(await fetchMyProfile());
        } catch (retryErr) {
          console.error('[AuthContext] Thử lại vẫn thất bại (còn phiên đăng nhập, giữ nguyên dữ liệu cũ):', retryErr);
        } finally {
          setLoading(false);
        }
      });
  };

  useEffect(() => {
    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        // Sự kiện làm mới token/đăng nhập lại vẫn CÒN session hợp lệ - nếu
        // tải hồ sơ lỗi thoáng qua, giữ nguyên profile đang có thay vì xoá
        // về null (tránh hiện nhầm "Chưa đăng nhập." khi vẫn đang đăng nhập).
        fetchMyProfile().then(setProfile).catch((err) => console.error('[AuthContext] Làm mới hồ sơ thất bại, giữ nguyên dữ liệu cũ:', err));
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Lắng nghe Realtime mọi cập nhật phân quyền (role, extra_roles, station, approved, active)
  useEffect(() => {
    if (!profile?.id) return undefined;
    const channel = supabase
      .channel(`own-profile-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` }, (payload) => {
        if (payload?.new) {
          setProfile(prev => ({ ...(prev || {}), ...payload.new }));
        }
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[AuthContext] Realtime profile subscription active');
        } else if (status === 'CLOSED') {
          console.warn('[AuthContext] Realtime profile subscription closed');
        }
        if (err) console.error('[AuthContext] Realtime error:', err);
      });
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  // Periodic refresh untuk memastikan role sync di mobile (setiap 45 detik)
  useEffect(() => {
    if (!profile?.id) return;
    const interval = setInterval(() => {
      fetchMyProfile().then(p => {
        if (p?.id === profile.id && (p.role !== profile.role || JSON.stringify(p.extra_roles) !== JSON.stringify(profile.extra_roles))) {
          setProfile(p);
          console.log('[AuthContext] Role refreshed via interval', p.role);
        }
      }).catch(err => console.error('[AuthContext] Refresh failed:', err));
    }, 45000);
    return () => clearInterval(interval);
  }, [profile?.id]);

  const can = (permission) => profile?.role && hasPermission(profile.role, permission);
  const canAny = (permissions) => profile?.role && hasAnyPermission(profile.role, permissions);
  const canAccess = (targetRole) => profile?.role && canAccessRole(profile.role, targetRole);

  const value = { profile, loading, reload: load, can, canAny, canAccess };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
