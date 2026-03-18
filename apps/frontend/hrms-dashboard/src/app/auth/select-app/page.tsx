'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { SpotlightBackground } from '@/components/spotlight-background';
import { api } from '@/lib/api';
import { clearTokens } from '@/lib/tokens';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const CURRENT_APP_CODE = 'HRMS';

const APP_LABELS: Record<string, { label: string; description: string }> = {
  SALES_DASHBOARD: { label: 'Sales Dashboard', description: 'Leads, clients, and sales operations' },
  PM_DASHBOARD: { label: 'PM Dashboard', description: 'Projects, tasks, and delivery workflows' },
  HRMS: { label: 'HRMS', description: 'People, teams, roles, and invitations' },
  CLIENT_PORTAL: { label: 'Admin', description: 'Administrative and client-facing controls' },
  ADMIN: { label: 'Admin', description: 'Administrative and client-facing controls' },
  COMM_SERVICE: { label: 'Communications', description: 'Inbox and messaging tools' },
};

export default function SelectAppPage() {
  const router = useRouter();
  const appsQuery = useQuery({
    queryKey: ['auth', 'my-apps'],
    queryFn: () => api.getMyApps(),
    retry: false,
  });

  useEffect(() => {
    if (appsQuery.isError) {
      clearTokens();
      router.push('/auth/login');
    }
  }, [appsQuery.isError, router]);

  useEffect(() => {
    const apps = appsQuery.data ?? [];
    if (apps.length !== 1) return;
    const [app] = apps;

    if (app.appCode === CURRENT_APP_CODE) {
      router.replace('/dashboard');
      return;
    }

    if ((app.appUrl || app.baseUrl) && typeof window !== 'undefined') {
      window.location.href = `${app.appUrl || app.baseUrl}/dashboard`;
    }
  }, [appsQuery.data, router]);

  if (appsQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading your apps...
      </div>
    );
  }

  const apps = appsQuery.data ?? [];

  return (
    <SpotlightBackground>
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-xl space-y-4">
          <div className="text-center">
            <h1 className="text-2xl font-semibold">Select an app</h1>
            <p className="text-sm text-muted-foreground">Choose where you want to continue.</p>
          </div>

          {apps.map((app) => {
            const meta = APP_LABELS[app.appCode] || { label: app.appLabel, description: '' };
            return (
              <Card key={app.appCode}>
                <button
                  className="w-full text-left"
                  onClick={() => {
                    if (app.appCode === CURRENT_APP_CODE) {
                      router.push('/dashboard');
                    } else if ((app.appUrl || app.baseUrl) && typeof window !== 'undefined') {
                      window.location.href = `${app.appUrl || app.baseUrl}/dashboard`;
                    }
                  }}
                >
                  <CardHeader>
                    <CardTitle>{meta.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">{meta.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {app.roles.length > 0 ? (
                        app.roles.map((role) => (
                          <Badge key={role.id} variant="secondary">
                            {role.name}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">No roles assigned</span>
                      )}
                    </div>
                  </CardContent>
                </button>
              </Card>
            );
          })}
        </div>
      </div>
    </SpotlightBackground>
  );
}
