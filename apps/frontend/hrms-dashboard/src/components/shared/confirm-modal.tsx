'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui-store';

export function ConfirmModal() {
  const confirmDialogOpen = useUIStore((s) => s.confirmDialogOpen);
  const confirmDialogData = useUIStore((s) => s.confirmDialogData);
  const closeConfirmDialog = useUIStore((s) => s.closeConfirmDialog);

  const handleConfirm = () => {
    confirmDialogData?.onConfirm();
    closeConfirmDialog();
  };

  return (
    <Dialog open={confirmDialogOpen} onOpenChange={closeConfirmDialog}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{confirmDialogData?.title ?? 'Are you sure?'}</DialogTitle>
          {confirmDialogData?.description && (
            <DialogDescription>{confirmDialogData.description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={closeConfirmDialog}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
