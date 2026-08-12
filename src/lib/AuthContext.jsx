import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchMyProfile } from './queries';
import { hasPermission, hasAnyPermission, canAccessRole } from './permissions';

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

  useEffect(load, []);

  const can = (permission) => profile?.role && hasPermission(profile.role, permission);
  const canAny = (permissions) => profile?.role && hasAnyPermission(profile.role, permissions);
  const canAccess = (targetRole) => profile?.role && canAccessRole(profile.role, targetRole);

  const value = { profile, loading, reload: load, can, canAny, canAccess };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
