'use client';

import { useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { Sidebar } from '@/components/sidebar';
import { TopNav } from '@/components/top-nav';
import { SpotlightBackground } from '@/components/spotlight-background';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ProtectedRoute>
      <SpotlightBackground>
        <div className="flex min-h-screen">
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <div className="flex min-h-screen flex-1 flex-col">
            <TopNav onMenuClick={() => setSidebarOpen(true)} />
            <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">{children}</main>
          </div>
        </div>
      </SpotlightBackground>
    </ProtectedRoute>
  );
}
