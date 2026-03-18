'use client';

import { useRouter } from 'next/navigation';
import { SpotlightBackground } from '@/components/spotlight-background';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { clearTokens } from '@/lib/tokens';

export default function SuspendedPage() {
  const router = useRouter();

  return (
    <SpotlightBackground>
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Account Suspended</CardTitle>
            <CardDescription>
              Your account is currently suspended. Contact an administrator to restore access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                clearTokens();
                router.push('/auth/login');
              }}
            >
              Back to login
            </Button>
          </CardContent>
        </Card>
      </div>
    </SpotlightBackground>
  );
}
