import { useAuth } from './AuthContext';
import PERMISSION_CHECKS from './permissions';

export function usePermissions() {
  const { profile, can, canAny, canAccess } = useAuth();

  return {
    role: profile?.role,
    can,
    canAny,
    canAccess,
    ...PERMISSION_CHECKS,
  };
}
