'use client';

import { ProtectedRoute } from '@/components/protected-route';
import { Sidebar } from '@/components/sidebar';
import { TopNav } from '@/components/top-nav';
import { SpotlightBackground } from '@/components/spotlight-background';
import { ConfirmModal, Toaster } from '@/components/shared';
import { CommEventsWatcher } from '@/components/shared/comm/comm-events-watcher';
import { NotificationProvider, useNotificationSocket } from '@sentra-core/notifications';
import { api } from '@/lib/api';

function NotificationSocketWatcher() {
  useNotificationSocket(true);
  return null;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <NotificationProvider fetcher={api}>
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
          <CommEventsWatcher />
          <NotificationSocketWatcher />
        </SpotlightBackground>
      </NotificationProvider>
    </ProtectedRoute>
  );
}
