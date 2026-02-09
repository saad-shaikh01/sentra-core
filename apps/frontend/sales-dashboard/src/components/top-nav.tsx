'use client';

import { Bell, Search, Command } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePathname } from 'next/navigation';

export function TopNav() {
  const pathname = usePathname();

  // Simple breadcrumb logic
  const segments = pathname.split('/').filter(Boolean);
  
  return (
    <header className="h-20 border-b border-white/5 bg-black/20 backdrop-blur-xl flex items-center justify-between px-8 sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <nav className="flex items-center gap-2 text-sm">
          {segments.map((segment, index) => {
            const isLast = index === segments.length - 1;
            const label = segment.charAt(0).toUpperCase() + segment.slice(1);
            
            return (
              <div key={segment} className="flex items-center gap-2">
                {index > 0 && <span className="text-muted-foreground/30">/</span>}
                <span className={isLast ? "text-foreground font-bold" : "text-muted-foreground font-medium"}>
                  {label}
                </span>
              </div>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-6">
        {/* Search Bar */}
        <div className="relative group hidden md:block">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input 
            placeholder="Search leads, orders..." 
            className="w-80 pl-10 h-10 bg-white/[0.03] border-white/10 rounded-xl"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-[10px] font-bold text-muted-foreground">
            <Command className="h-2.5 w-2.5" />
            <span>K</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-white/10 relative">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <span className="absolute top-2.5 right-2.5 h-2 w-2 bg-primary rounded-full border-2 border-black" />
          </Button>
          
          <div className="h-6 w-px bg-white/10 mx-2" />
          
          <Button variant="shine" size="sm" className="hidden lg:flex gap-2">
            <Search className="h-4 w-4" />
            Quick Search
          </Button>
        </div>
      </div>
    </header>
  );
}
