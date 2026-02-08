'use client';

import { useAuth } from '@/hooks/use-auth';
import { UserRole, getRoleLevel } from '@sentra-core/types';

interface RoleGuardProps {
  children: React.ReactNode;
  allowed: UserRole[];
  fallback?: React.ReactNode;
}

export function RoleGuard({ children, allowed, fallback = null }: RoleGuardProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!user) {
    return fallback;
  }

  const hasAccess = allowed.some((role) => {
    if (user.role === role) return true;
    return getRoleLevel(user.role) > getRoleLevel(role);
  });

  if (!hasAccess) {
    return fallback;
  }

  return <>{children}</>;
}
