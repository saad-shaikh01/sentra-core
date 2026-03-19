'use client';

import { createContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getTokens } from '@/lib/tokens';

type PermissionsContextValue = {
  permissions: Set<string>;
  hasPermission: (code: string) => boolean;
  isLoading: boolean;
};

const defaultValue: PermissionsContextValue = {
  permissions: new Set(),
  hasPermission: () => false,
  isLoading: false,
};

export const PermissionsContext = createContext<PermissionsContextValue>(defaultValue);

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = getTokens();

  const query = useQuery({
    queryKey: ['auth', 'my-permissions'],
    queryFn: () => api.getMyPermissions(),
    enabled: !!accessToken,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const permissions = useMemo(() => new Set(query.data ?? []), [query.data]);

  const value = useMemo<PermissionsContextValue>(() => ({
    permissions,
    isLoading: !!accessToken && query.isPending,
    hasPermission: (code: string) => {
      if (permissions.has('*:*:*')) return true;
      const [app] = code.split(':');
      if (app && permissions.has(`${app}:*:*`)) return true;
      return permissions.has(code);
    },
  }), [accessToken, permissions, query.isPending]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
