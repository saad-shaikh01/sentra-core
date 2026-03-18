'use client';

import Link from 'next/link';
import { Menu, UserCircle2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, useLogout } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/shared';
import { toast } from '@/hooks/use-toast';

export function TopNav({
  onMenuClick,
}: {
  onMenuClick: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const logout = useLogout();

  const title =
    pathname
      .split('/')
      .filter(Boolean)
      .slice(1)
      .map((segment) => segment.replace(/-/g, ' '))
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' / ') || 'Dashboard';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-black/40 px-4 backdrop-blur-xl md:px-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick}>
          <Menu className="h-4 w-4" />
        </Button>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">
            {user?.organization?.name || 'Human resources workspace'}
          </p>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-3 rounded-full px-2 py-1.5">
            <UserAvatar
              name={user?.name || 'User'}
              avatarUrl={user?.avatarUrl}
              className="h-9 w-9"
            />
            <div className="hidden text-left md:block">
              <p className="text-sm font-medium">{user?.name || 'HRMS User'}</p>
              <p className="text-xs text-muted-foreground">{user?.email || 'No email'}</p>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dashboard/employees">
              <UserCircle2 className="mr-2 h-4 w-4" />
              My Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toast.info('Sessions management is coming in a later ticket')}>
            My Sessions
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() =>
              logout.mutate(undefined, {
                onSuccess: () => router.push('/auth/login'),
              })
            }
          >
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
