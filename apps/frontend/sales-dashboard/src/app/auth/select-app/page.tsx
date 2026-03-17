'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SpotlightBackground } from '@/components/spotlight-background';
import { api } from '@/lib/api';
import { clearTokens } from '@/lib/tokens';

const CURRENT_APP_CODE = 'SALES_DASHBOARD';

const APP_LABELS: Record<string, { label: string; description: string }> = {
  SALES_DASHBOARD: { label: 'Sales Dashboard', description: 'Manage leads, clients, and sales' },
  PM_DASHBOARD: { label: 'PM Dashboard', description: 'Manage projects and tasks' },
  HRMS: { label: 'HRMS', description: 'Human resources management' },
  ADMIN: { label: 'Admin', description: 'Platform administration' },
  COMM_SERVICE: { label: 'Communications', description: 'Email and communication tools' },
};

export default function SelectAppPage() {
  const router = useRouter();

  const appsQuery = useQuery({
    queryKey: ['auth', 'apps'],
    queryFn: () => api.getAvailableApps(),
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
    if (apps.length === 0) return;
    if (apps.length === 1) {
      const app = apps[0];
      if (app.appCode === CURRENT_APP_CODE) {
        router.replace('/dashboard');
      } else if (app.baseUrl && typeof window !== 'undefined') {
        window.location.href = `${app.baseUrl}/dashboard`;
      } else {
        router.replace('/dashboard');
      }
    }
  }, [appsQuery.data, router]);

  if (appsQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading your apps...</p>
      </div>
    );
  }

  const apps = appsQuery.data ?? [];

  if (apps.length === 0) {
    return (
      <SpotlightBackground>
        <div className="min-h-screen flex items-center justify-center px-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">No apps assigned</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-sm text-muted-foreground">
              Contact your administrator to get access to an application.
            </CardContent>
          </Card>
        </div>
      </SpotlightBackground>
    );
  }

  return (
    <SpotlightBackground>
      <div className="min-h-screen flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-lg space-y-6"
        >
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold">Select an app</h1>
            <p className="text-sm text-muted-foreground">Choose where you want to go</p>
          </div>

          <div className="grid gap-3">
            {apps.map((app) => {
              const meta = APP_LABELS[app.appCode] || { label: app.appName, description: '' };
              return (
                <button
                  key={app.appCode}
                  className="flex flex-col items-start gap-1 rounded-lg border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
                  onClick={() => {
                    if (app.appCode === CURRENT_APP_CODE) {
                      router.push('/dashboard');
                    } else if (app.baseUrl && typeof window !== 'undefined') {
                      window.location.href = `${app.baseUrl}/dashboard`;
                    } else {
                      router.push('/dashboard');
                    }
                  }}
                >
                  <span className="font-medium">{meta.label}</span>
                  {meta.description && (
                    <span className="text-xs text-muted-foreground">{meta.description}</span>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>
    </SpotlightBackground>
  );
}
