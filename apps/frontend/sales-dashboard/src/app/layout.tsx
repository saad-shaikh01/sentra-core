import './global.css';
import { Providers } from '@/components/providers';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

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
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen bg-background font-sans antialiased selection:bg-primary selection:text-white">
        {/* Premium Background Elements */}
        <div className="mesh-gradient" />
        <div className="noise-overlay" />
        
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
