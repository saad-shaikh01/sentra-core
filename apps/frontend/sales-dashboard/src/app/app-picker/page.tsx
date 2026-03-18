'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useUser } from '@/hooks/use-auth';

export default function AppPickerPage() {
  const router = useRouter();
  const { data: user, isLoading: userLoading, isError } = useUser();

  const appsQuery = useQuery({
    queryKey: ['auth', 'my-apps'],
    queryFn: () => api.getMyApps(),
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
      if (app.appCode === 'SALES_DASHBOARD') {
        router.replace('/dashboard');
        return;
      }
      if ((app.appUrl || app.baseUrl) && typeof window !== 'undefined') {
        window.location.href = `${app.appUrl || app.baseUrl}/dashboard`;
      }
    }
  }, [appsQuery.data, router]);

  if (userLoading || appsQuery.isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading apps...</div>;
  }

  const apps = appsQuery.data ?? [];

  if (apps.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>No apps assigned</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Contact your administrator to get access to an application.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold">Select App</h1>
        <p className="text-sm text-muted-foreground">Choose where you want to continue.</p>

        <div className="grid gap-4 md:grid-cols-2">
          {apps.map((app) => (
            <Card key={app.appCode}>
              <CardHeader>
                <CardTitle>{app.appLabel}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex flex-wrap gap-2">
                  {app.roles.length > 0 ? (
                    app.roles.map((role) => (
                      <Badge key={role.id} variant="secondary">
                        {role.name}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No roles assigned</span>
                  )}
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    if (app.appCode === 'SALES_DASHBOARD') {
                      router.push('/dashboard');
                      return;
                    }
                    if ((app.appUrl || app.baseUrl) && typeof window !== 'undefined') {
                      window.location.href = `${app.appUrl || app.baseUrl}/dashboard`;
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
