'use client';

import { createContext, useEffect, useMemo, useState } from 'react';
import { getTokens } from '@/lib/tokens';

export type OrgContextValue = {
  userId: string | null;
  organizationId: string | null;
  role: string | null;
};

const defaultValue: OrgContextValue = {
  userId: null,
  organizationId: null,
  role: null,
};

export const OrgContext = createContext<OrgContextValue>(defaultValue);

function decodeAccessToken(): OrgContextValue {
  const { accessToken } = getTokens();
  if (!accessToken) return defaultValue;

  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1] ?? ''));
    return {
      userId: payload.sub ?? null,
      organizationId: payload.orgId ?? payload.organizationId ?? null,
      role: payload.role ?? null,
    };
  } catch {
    return defaultValue;
  }
}

export function OrgContextProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<OrgContextValue>(defaultValue);

  useEffect(() => {
    const sync = () => setValue(decodeAccessToken());
    sync();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const resolvedValue = useMemo(() => value, [value]);

  return <OrgContext.Provider value={resolvedValue}>{children}</OrgContext.Provider>;
}
