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

  const load = () => {
    setLoading(true);
    fetchMyProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        fetchMyProfile().then(setProfile).catch(() => setProfile(null));
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
