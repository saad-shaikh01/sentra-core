'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Mail,
  UsersRound,
  Building2,
  Shield,
  LayoutDashboard,
  LogOut,
  ChevronLeft,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth, useLogout } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useUIStore, useSidebarOpen } from '@/stores/ui-store';
import { useEffect, useState } from 'react';

const navigation = [
  { name: 'Employees', href: '/dashboard/employees', icon: Users, permission: 'hrms:users:view' },
  { name: 'Invitations', href: '/dashboard/invitations', icon: Mail, permission: 'hrms:users:invite' },
  { name: 'Teams', href: '/dashboard/teams', icon: UsersRound, permission: 'hrms:teams:view' },
  { name: 'Departments', href: '/dashboard/departments', icon: Building2, permission: 'hrms:departments:manage' },
  { name: 'Roles & Permissions', href: '/dashboard/roles', icon: Shield, permission: 'hrms:roles:view' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const logoutMutation = useLogout();
  const { hasPermission } = usePermissions();
  const sidebarOpen = useSidebarOpen();
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile && sidebarOpen) {
      setSidebarOpen(false);
    }
  }, [pathname, isMobile]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const visibleNavigation = navigation.filter(item => hasPermission(item.permission));

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isMobile && sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[45] lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={false}
        animate={{ 
          width: isMobile ? 280 : (sidebarOpen ? 280 : 88),
          x: isMobile ? (sidebarOpen ? 0 : -280) : 0
        }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "flex h-full flex-col bg-black/40 backdrop-blur-3xl border-r border-white/10 z-50",
          isMobile ? "fixed inset-y-0 left-0 shadow-2xl" : "relative"
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />

        {/* Logo */}
        <div className="flex h-20 items-center justify-between px-6 border-b border-white/5 shrink-0">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-all duration-300">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            {(sidebarOpen || isMobile) && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="text-xl font-bold tracking-tight text-foreground"
              >
                Sentra HRMS
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
                (!sidebarOpen && !isMobile) && 'rotate-180'
              )}
            />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-6 px-4 py-8 overflow-y-auto">
          <div className="space-y-1.5">
            {visibleNavigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
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
                  {(sidebarOpen || isMobile) && (
                    <motion.span
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -5 }}
                      className="flex-1"
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
        </nav>

        {/* User Profile */}
        <div className="border-t border-white/5 p-6 bg-white/[0.02] shrink-0">
          <div className={cn('flex items-center', (sidebarOpen || isMobile) ? 'gap-4' : 'justify-center')}>
            <div className="relative group cursor-pointer">
              <Avatar className="h-11 w-11 ring-2 ring-primary/10 group-hover:ring-primary/40 transition-all duration-300 shadow-lg">
                <AvatarImage src={user?.avatarUrl} />
                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                  {user ? getInitials(user.name) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 h-4 w-4 bg-green-500 border-2 border-black rounded-full shadow-lg" />
            </div>
            {(sidebarOpen || isMobile) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex-1 min-w-0"
              >
                <p className="text-sm font-bold truncate tracking-tight">{user?.name}</p>
                <Badge variant="secondary" className="mt-1">
                  {user?.role?.replace(/_/g, ' ') || 'User'}
                </Badge>
              </motion.div>
            )}
            {(sidebarOpen || isMobile) && (
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
    </>
  );
}
