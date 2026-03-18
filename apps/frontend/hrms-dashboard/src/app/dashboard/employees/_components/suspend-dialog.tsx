'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { hrmsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function SuspendDialog({
  open,
  employeeId,
  employeeName,
  onOpenChange,
}: {
  open: boolean;
  employeeId: string;
  employeeName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) {
      setReason('');
    }
  }, [open]);

  const suspendMutation = useMutation({
    mutationFn: async () => {
      return hrmsApi.patch<{ data: { message: string; revokedSessions: number } }>(
        `/employees/${employeeId}/suspend`,
        { reason: reason.trim() },
      );
    },
    onSuccess: () => {
      toast.success(`${employeeName} has been suspended.`);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to suspend employee.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend {employeeName}?</DialogTitle>
          <DialogDescription>
            This will immediately revoke their active sessions and block further logins.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="suspend-reason">Reason</Label>
          <Textarea
            id="suspend-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain why this account is being suspended."
            rows={4}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={suspendMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => suspendMutation.mutate()}
            disabled={!reason.trim() || suspendMutation.isPending}
          >
            {suspendMutation.isPending ? 'Suspending...' : 'Suspend Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
