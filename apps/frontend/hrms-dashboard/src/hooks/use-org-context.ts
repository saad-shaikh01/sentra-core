'use client';

import { useContext } from 'react';
import { OrgContext } from '@/providers/org-context-provider';

export function useOrgContext() {
  return useContext(OrgContext);
}
