'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';

const CURRENT_APP_CODE = 'SALES_DASHBOARD';

export function AppSwitcher() {
  const router = useRouter();
  const { data: apps = [] } = useQuery({
    queryKey: ['auth', 'apps'],
    queryFn: () => api.getAvailableApps(),
  });

  if (apps.length <= 1) return null;

  return (
    <Select
      value={CURRENT_APP_CODE}
      onValueChange={(v) => {
        if (v === CURRENT_APP_CODE) {
          router.push('/dashboard');
          return;
        }
        const target = apps.find((a) => a.appCode === v);
        if (target?.baseUrl && typeof window !== 'undefined') {
          window.location.href = `${target.baseUrl}/dashboard`;
        }
      }}
    >
      <SelectTrigger className="w-[170px] h-10 bg-white/[0.03] border-white/10 rounded-xl">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {apps.map((app) => (
          <SelectItem key={app.appCode} value={app.appCode}>
            {app.appName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
