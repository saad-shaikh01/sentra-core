'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function UserAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  className?: string;
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Avatar className={className}>
      <AvatarImage src={avatarUrl ?? undefined} alt={name} />
      <AvatarFallback>{initials || 'U'}</AvatarFallback>
    </Avatar>
  );
}
