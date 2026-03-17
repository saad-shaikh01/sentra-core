'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SpotlightBackground } from '@/components/spotlight-background';
import { clearTokens } from '@/lib/tokens';

export default function SuspendedPage() {
  const router = useRouter();

  function handleLogout() {
    clearTokens();
    router.push('/auth/login');
  }

  return (
    <SpotlightBackground>
      <div className="min-h-screen flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-md"
        >
          <Card>
            <CardHeader className="text-center space-y-2">
              <div className="mx-auto h-12 w-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                <svg
                  className="h-6 w-6 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                  />
                </svg>
              </div>
              <CardTitle className="text-2xl font-bold text-red-400">Account Suspended</CardTitle>
              <CardDescription>
                Your account has been suspended. Please contact your administrator to regain access.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={handleLogout} className="w-full">
                Sign out
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </SpotlightBackground>
  );
}
