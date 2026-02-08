import './global.css';
import { Providers } from '@/components/providers';

export const metadata = {
  title: 'Sentra - Sales Dashboard',
  description: 'Multi-tenant ERP/CRM for Software Agencies',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
