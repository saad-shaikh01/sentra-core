import './global.css';
import { Inter } from 'next/font/google';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { QueryProvider } from '@/providers/query-provider';
import { OrgContextProvider } from '@/providers/org-context-provider';
import { PermissionsProvider } from '@/providers/permissions-provider';
import { Toaster } from '@/components/shared';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata = {
  title: 'Sentra HRMS',
  description: 'Human resources management dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen bg-background font-sans antialiased selection:bg-primary selection:text-white">
        <div className="mesh-gradient" />
        <div className="noise-overlay" />
        <NuqsAdapter>
          <QueryProvider>
            <OrgContextProvider>
              <PermissionsProvider>
                {children}
                <Toaster />
              </PermissionsProvider>
            </OrgContextProvider>
          </QueryProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
