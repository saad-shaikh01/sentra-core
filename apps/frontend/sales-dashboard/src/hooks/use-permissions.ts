'use client';

import { useContext } from 'react';
import { PermissionsContext } from '@/providers/permissions-provider';

export function usePermissions() {
  return useContext(PermissionsContext);
}
