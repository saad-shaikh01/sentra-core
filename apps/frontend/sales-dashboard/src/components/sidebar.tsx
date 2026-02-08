'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  LogOut,
  UserCircle,
  Building2,
  ChevronLeft,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth, useLogout } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RoleGuard } from '@/components/role-guard';
import { ThemeToggle } from '@/components/theme-toggle';
import { useUIStore, useSidebarOpen } from '@/stores/ui-store';
import { UserRole } from '@sentra-core/types';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Leads', href: '/dashboard/leads', icon: Users },
  { name: 'Orders', href: '/dashboard/orders', icon: FileText },
];

const settingsNavigation = [
  { name: 'Profile', href: '/dashboard/settings/profile', icon: UserCircle },
  {
    name: 'Team',
    href: '/dashboard/settings/team',
    icon: Building2,
    roles: [UserRole.OWNER, UserRole.ADMIN] as UserRole[],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const logoutMutation = useLogout();
  const sidebarOpen = useSidebarOpen();
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);

  const getRoleBadgeVariant = (role: string) => {
    const variants: Record<string, any> = {
      OWNER: 'owner',
      ADMIN: 'admin',
      SALES_MANAGER: 'sales-manager',
      PROJECT_MANAGER: 'project-manager',
      FRONTSELL_AGENT: 'frontsell-agent',
      UPSELL_AGENT: 'upsell-agent',
    };
    return variants[role] || 'secondary';
  };

  const formatRole = (role: string) => {
    return role.replace(/_/g, ' ');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <motion.div
      initial={false}
      animate={{ width: sidebarOpen ? 256 : 80 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex h-full flex-col bg-white/5 backdrop-blur-xl border-r border-white/10"
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-white/10">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          {sidebarOpen && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-lg font-bold text-foreground"
            >
              Sentra
            </motion.span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="h-8 w-8"
        >
          <ChevronLeft
            className={cn(
              'h-4 w-4 transition-transform duration-300',
              !sidebarOpen && 'rotate-180'
            )}
          />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        <div className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                )}
              >
                <item.icon className={cn('h-5 w-5 shrink-0', isActive && 'text-primary')} />
                {sidebarOpen && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {item.name}
                  </motion.span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Settings Section */}
        <div className="pt-4">
          {sidebarOpen && (
            <div className="px-3 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Settings
              </h3>
            </div>
          )}
          <div className="space-y-1">
            {settingsNavigation.map((item) => {
              const isActive = pathname === item.href;
              const navItem = (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                  )}
                >
                  <item.icon className={cn('h-5 w-5 shrink-0', isActive && 'text-primary')} />
                  {sidebarOpen && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      {item.name}
                    </motion.span>
                  )}
                </Link>
              );

              if (item.roles) {
                return (
                  <RoleGuard key={item.name} allowed={item.roles}>
                    {navItem}
                  </RoleGuard>
                );
              }

              return navItem;
            })}
          </div>
        </div>
      </nav>

      {/* Theme Toggle */}
      <div className="px-3 py-2 border-t border-white/10">
        <div className={cn('flex items-center', sidebarOpen ? 'justify-between' : 'justify-center')}>
          {sidebarOpen && (
            <span className="text-xs text-muted-foreground">Theme</span>
          )}
          <ThemeToggle />
        </div>
      </div>

      {/* User Profile */}
      <div className="border-t border-white/10 p-4">
        <div className={cn('flex items-center', sidebarOpen ? 'gap-3' : 'justify-center')}>
          <Avatar className="h-10 w-10 ring-2 ring-primary/20">
            <AvatarImage src={user?.avatarUrl} />
            <AvatarFallback className="bg-primary/20 text-primary">
              {user ? getInitials(user.name) : 'U'}
            </AvatarFallback>
          </Avatar>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 min-w-0"
            >
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <Badge variant={getRoleBadgeVariant(user?.role || '')} className="text-xs mt-0.5">
                {formatRole(user?.role || '')}
              </Badge>
            </motion.div>
          )}
          {sidebarOpen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logoutMutation.mutate()}
              className="shrink-0 hover:bg-red-500/10 hover:text-red-400"
              title="Logout"
              disabled={logoutMutation.isPending}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
