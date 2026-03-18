'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { Employee } from '../../_components/types';
import { formatDateTime, formatValue } from '../../_components/utils';

function ProfileField({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

export function ProfileTab({
  employee,
}: {
  employee: Employee;
}) {
  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardContent className="grid gap-6 pt-6 md:grid-cols-2">
        <ProfileField label="First Name" value={formatValue(employee.firstName)} />
        <ProfileField label="Last Name" value={formatValue(employee.lastName)} />
        <ProfileField label="Email" value={formatValue(employee.email)} />
        <ProfileField label="Phone" value={formatValue(employee.phone)} />
        <ProfileField label="Job Title" value={formatValue(employee.jobTitle)} />
        <ProfileField label="Department" value={formatValue(employee.department?.name)} />
        <ProfileField label="Member Since" value={formatDateTime(employee.createdAt)} />
        <ProfileField label="Last Updated" value={formatDateTime(employee.updatedAt)} />
        {employee.suspendReason ? (
          <ProfileField
            label="Suspend Reason"
            value={employee.suspendReason}
            className="md:col-span-2 text-orange-300"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
