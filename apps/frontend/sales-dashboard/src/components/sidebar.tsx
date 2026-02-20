'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  FileText,
  LogOut,
  UserCircle,
  Building2,
  ChevronLeft,
  Zap,
  Layers,
  DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth, useLogout } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RoleGuard } from '@/components/role-guard';
import { useUIStore, useSidebarOpen } from '@/stores/ui-store';
import { UserRole } from '@sentra-core/types';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Brands',    href: '/dashboard/brands',   icon: Layers },
  { name: 'Leads',     href: '/dashboard/leads',    icon: Users },
  { name: 'Clients',   href: '/dashboard/clients',  icon: Building2 },
  { name: 'Sales',     href: '/dashboard/sales',    icon: DollarSign },
  { name: 'Invoices',  href: '/dashboard/invoices', icon: FileText },
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
      animate={{ width: sidebarOpen ? 280 : 88 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full flex-col bg-black/40 backdrop-blur-3xl border-r border-white/10 z-50 relative"
    >
      {/* Sidebar Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />

      {/* Logo */}
      <div className="flex h-20 items-center justify-between px-6 border-b border-white/5">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-all duration-300">
            <Zap className="h-5 w-5 text-primary animate-pulse-slow" />
          </div>
          {sidebarOpen && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="text-xl font-bold tracking-tight text-foreground"
            >
              Sentra
            </motion.span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="h-8 w-8 hover:bg-white/10"
        >
          <ChevronLeft
            className={cn(
              'h-4 w-4 transition-transform duration-500',
              !sidebarOpen && 'rotate-180'
            )}
          />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 px-4 py-8 overflow-y-auto">
        <div className="space-y-1.5">
          {navigation.map((item) => {
            const isActive = item.href === '/dashboard'
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300 relative group',
                  isActive
                    ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                )}
              >
                <item.icon className={cn('h-5 w-5 shrink-0 transition-transform duration-300 group-hover:scale-110', isActive && 'text-primary')} />
                {sidebarOpen && (
                  <motion.span
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -5 }}
                  >
                    {item.name}
                  </motion.span>
                )}
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute left-0 w-1 h-6 bg-primary rounded-r-full"
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Settings Section */}
        <div className="pt-2">
          {sidebarOpen && (
            <div className="px-4 py-3">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">
                System Settings
              </h3>
            </div>
          )}
          <div className="space-y-1.5">
            {settingsNavigation.map((item) => {
              const isActive = pathname === item.href;
              const navItem = (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300 group relative',
                    isActive
                      ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]'
                      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                  )}
                >
                  <item.icon className={cn('h-5 w-5 shrink-0 transition-transform duration-300 group-hover:scale-110', isActive && 'text-primary')} />
                  {sidebarOpen && (
                    <motion.span
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -5 }}
                    >
                      {item.name}
                    </motion.span>
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute left-0 w-1 h-6 bg-primary rounded-r-full"
                    />
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

      {/* User Profile */}
      <div className="border-t border-white/5 p-6 bg-white/[0.02]">
        <div className={cn('flex items-center', sidebarOpen ? 'gap-4' : 'justify-center')}>
          <div className="relative group cursor-pointer">
            <Avatar className="h-11 w-11 ring-2 ring-primary/10 group-hover:ring-primary/40 transition-all duration-300 shadow-lg">
              <AvatarImage src={user?.avatarUrl} />
              <AvatarFallback className="bg-primary/10 text-primary font-bold">
                {user ? getInitials(user.name) : 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 h-4 w-4 bg-green-500 border-2 border-black rounded-full shadow-lg" />
          </div>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex-1 min-w-0"
            >
              <p className="text-sm font-bold truncate tracking-tight">{user?.name}</p>
              <Badge variant={getRoleBadgeVariant(user?.role || '')} className="mt-1">
                {formatRole(user?.role || '')}
              </Badge>
            </motion.div>
          )}
          {sidebarOpen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logoutMutation.mutate()}
              className="shrink-0 h-9 w-9 hover:bg-red-500/10 hover:text-red-400 rounded-xl transition-all duration-300"
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
