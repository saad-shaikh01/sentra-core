'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Mail, Shield, Users, UsersRound, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';

const NAV_ITEMS = [
  { href: '/dashboard/employees', label: 'Employees', icon: Users, permission: 'hrms:users:view' },
  { href: '/dashboard/invitations', label: 'Invitations', icon: Mail, permission: 'hrms:users:invite' },
  { href: '/dashboard/teams', label: 'Teams', icon: UsersRound, permission: 'hrms:teams:view' },
  { href: '/dashboard/departments', label: 'Departments', icon: Building2, permission: 'hrms:departments:manage' },
  { href: '/dashboard/roles', label: 'Roles & Permissions', icon: Shield, permission: 'hrms:roles:view' },
];

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { hasPermission, isLoading } = usePermissions();
  const visibleItems = NAV_ITEMS.filter((item) => hasPermission(item.permission));

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/60 transition-opacity md:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 border-r border-white/10 bg-black/80 backdrop-blur-xl transition-transform md:static md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sentra</p>
            <h1 className="text-lg font-semibold">HRMS</h1>
          </div>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="space-y-1 p-3">
          {isLoading ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Loading navigation...</p>
          ) : visibleItems.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No sections available.</p>
          ) : (
            visibleItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })
          )}
        </nav>
      </aside>
    </>
  );
}
