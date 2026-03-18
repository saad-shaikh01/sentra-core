'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/shared';
import { cn } from '@/lib/utils';
import { RolesAppTab } from './_components/roles-app-tab';

const APP_TABS = [
  { code: 'SALES', label: 'Sales Dashboard' },
  { code: 'PM', label: 'PM Dashboard' },
  { code: 'HRMS', label: 'HRMS' },
] as const;

export default function RolesPage() {
  const [activeApp, setActiveApp] = useState<(typeof APP_TABS)[number]['code']>('SALES');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Permissions"
        description="Manage what users can do in each app."
      />

      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
        {APP_TABS.map((tab) => (
          <button
            key={tab.code}
            type="button"
            onClick={() => setActiveApp(tab.code)}
            className={cn(
              'rounded-xl px-4 py-2 text-sm transition-colors',
              activeApp === tab.code
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <RolesAppTab appCode={activeApp} />
    </div>
  );
}
