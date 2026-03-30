'use client';

import { ProtectedRoute } from '@/components/protected-route';
import { Sidebar } from '@/components/sidebar';
import { TopNav } from '@/components/top-nav';
import { SpotlightBackground } from '@/components/spotlight-background';
import { ConfirmModal, Toaster } from '@/components/shared';
import { CommEventsWatcher } from '@/components/shared/comm/comm-events-watcher';
import { RingCentralCallDock } from '@/components/shared/ringcentral/ringcentral-call-dock';
import { NotificationProvider, useNotificationSocket, NotificationPushInit } from '@sentra-core/notifications';
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
        <NotificationPushInit fetcher={api} autoRequest={true} />
        <SpotlightBackground>
          <div className="flex min-h-screen lg:h-screen lg:overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <TopNav />
              <main className="flex-1 lg:overflow-y-auto">
                <div className="container max-w-7xl py-6 px-4 md:py-10 md:px-8">{children}</div>
              </main>
            </div>
          </div>
          <ConfirmModal />
          <Toaster />
          <CommEventsWatcher />
          <RingCentralCallDock />
          <NotificationSocketWatcher />
        </SpotlightBackground>
      </NotificationProvider>
    </ProtectedRoute>
  );
}
