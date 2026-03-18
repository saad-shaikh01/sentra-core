'use client';

import React from 'react';

interface FilterBarProps {
  children: React.ReactNode;
}

export function FilterBar({ children }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      {children}
    </div>
  );
}
