'use client';

import { ProtectedRoute } from '@/components/protected-route';
import { Sidebar } from '@/components/sidebar';
import { TopNav } from '@/components/top-nav';
import { SpotlightBackground } from '@/components/spotlight-background';
import { ConfirmModal, Toaster } from '@/components/shared';

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
          <div className="flex-1 flex flex-col min-w-0">
            <TopNav />
            <main className="flex-1 overflow-y-auto">
              <div className="container max-w-7xl py-10 px-8">{children}</div>
            </main>
          </div>
        </div>
        <ConfirmModal />
        <Toaster />
      </SpotlightBackground>
    </ProtectedRoute>
  );
}
