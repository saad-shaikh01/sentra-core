'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useUser } from '@/hooks/use-auth';

export default function AppPickerPage() {
  const router = useRouter();
  const { data: user, isLoading: userLoading, isError } = useUser();

  const appsQuery = useQuery({
    queryKey: ['auth', 'apps'],
    queryFn: () => api.getAvailableApps(),
    enabled: !!user,
  });

  useEffect(() => {
    if (!userLoading && (isError || !user)) {
      router.replace('/auth/login');
    }
  }, [userLoading, isError, user, router]);

  useEffect(() => {
    const apps = appsQuery.data ?? [];
    if (apps.length === 1) {
      const app = apps[0];
      if (app.appCode === 'PM_DASHBOARD') {
        router.replace('/dashboard');
        return;
      }
      if (app.baseUrl && typeof window !== 'undefined') {
        window.location.href = `${app.baseUrl}/dashboard`;
      }
    }
  }, [appsQuery.data, router]);

  if (userLoading || appsQuery.isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading apps...</div>;
  }

  const apps = appsQuery.data ?? [];

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold">Select App</h1>
        <p className="text-sm text-muted-foreground">Choose where you want to continue.</p>

        <div className="grid gap-4 md:grid-cols-2">
          {apps.map((app) => (
            <Card key={app.appCode}>
              <CardHeader>
                <CardTitle>{app.appName}</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={() => {
                    if (app.appCode === 'PM_DASHBOARD') {
                      router.push('/dashboard');
                      return;
                    }
                    if (app.baseUrl && typeof window !== 'undefined') {
                      window.location.href = `${app.baseUrl}/dashboard`;
                    }
                  }}
                >
                  Open
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
