'use client';

import { ProtectedRoute } from '@/components/protected-route';
import { Sidebar } from '@/components/sidebar';
import { SpotlightBackground } from '@/components/spotlight-background';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <SpotlightBackground>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <div className="container max-w-7xl py-8 px-6">{children}</div>
          </main>
        </div>
      </SpotlightBackground>
    </ProtectedRoute>
  );
}
