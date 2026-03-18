'use client';

import { useState, useEffect } from 'react';
import { Bell, Search, Command, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePathname } from 'next/navigation';
import { AppSwitcher } from '@/components/app-switcher';
import { CommandPalette } from '@/components/command-palette';
import { MySessionsModal } from '@/components/my-sessions-modal';

export function TopNav() {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);

  // Simple breadcrumb logic
  const segments = pathname.split('/').filter(Boolean);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <MySessionsModal open={sessionsOpen} onClose={() => setSessionsOpen(false)} />

      <header className="h-20 border-b border-white/5 bg-black/20 backdrop-blur-xl flex items-center justify-between px-8 sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <nav className="flex items-center gap-2 text-sm">
            {segments.map((segment, index) => {
              const isLast = index === segments.length - 1;
              const label = segment.charAt(0).toUpperCase() + segment.slice(1);

              return (
                <div key={segment} className="flex items-center gap-2">
                  {index > 0 && <span className="text-muted-foreground/30">/</span>}
                  <span className={isLast ? 'text-foreground font-bold' : 'text-muted-foreground font-medium'}>
                    {label}
                  </span>
                </div>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-6">
          {/* Search trigger */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="relative group hidden md:flex items-center w-80 h-10 pl-10 pr-3 bg-white/[0.03] border border-white/10 rounded-xl text-sm text-muted-foreground hover:bg-white/[0.06] hover:border-white/20 transition-all"
          >
            <Search className="absolute left-3.5 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="flex-1 text-left">Search leads, orders...</span>
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-[10px] font-bold">
              <Command className="h-2.5 w-2.5" />
              <span>K</span>
            </div>
          </button>

          <div className="flex items-center gap-2">
            <AppSwitcher />
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-white/10 relative">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span className="absolute top-2.5 right-2.5 h-2 w-2 bg-primary rounded-full border-2 border-black" />
            </Button>

            <div className="h-6 w-px bg-white/10 mx-2" />

            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-xl hover:bg-white/10"
              title="My Sessions"
              onClick={() => setSessionsOpen(true)}
            >
              <User className="h-5 w-5 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </header>
    </>
  );
}
