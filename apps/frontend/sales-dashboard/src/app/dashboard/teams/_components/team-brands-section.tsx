'use client';

import { useState } from 'react';
import { Tag, Plus, X, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBrands } from '@/hooks/use-brands';
import {
  useTeamBrandsByTeam,
  useAssignBrand,
  useUnassignBrand,
} from '@/hooks/use-team-brands';
import { useUIStore } from '@/stores/ui-store';
import type { IBrand } from '@sentra-core/types';

interface Props {
  teamId: string;
  canManage: boolean;
}

function AssignBrandModal({
  open,
  teamId,
  assignedBrandIds,
  onOpenChange,
}: {
  open: boolean;
  teamId: string;
  assignedBrandIds: string[];
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const brandsQuery = useBrands({ limit: 100 });
  const assignMutation = useAssignBrand(teamId);

  const availableBrands: IBrand[] = (brandsQuery.data?.data ?? []).filter(
    (b: IBrand) => !assignedBrandIds.includes(b.id),
  );

  function handleAssign() {
    if (!selectedBrandId) return;
    assignMutation.mutate(selectedBrandId, {
      onSuccess: () => {
        setSelectedBrandId('');
        onOpenChange(false);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Brand to Team</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {assignMutation.isError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {(assignMutation.error as any)?.message ?? 'Failed to assign brand'}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Select Brand</label>
            {availableBrands.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {brandsQuery.isLoading
                  ? 'Loading brands...'
                  : 'All brands are already assigned to teams.'}
              </p>
            ) : (
              <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a brand..." />
                </SelectTrigger>
                <SelectContent>
                  {availableBrands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              Each brand can only belong to one team at a time.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedBrandId || assignMutation.isPending || availableBrands.length === 0}
          >
            {assignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Assign Brand
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeamBrandsSection({ teamId, canManage }: Props) {
  const [assignOpen, setAssignOpen] = useState(false);
  const { data: mappings, isLoading, isError } = useTeamBrandsByTeam(teamId);
  const unassignMutation = useUnassignBrand();
  const openConfirmDialog = useUIStore((s) => s.openConfirmDialog);

  const assignedBrandIds = mappings.map((m) => m.brandId);

  function handleUnassign(brandId: string, brandName: string) {
    openConfirmDialog({
      title: `Remove "${brandName}" from team?`,
      description:
        'Agents in this team will no longer see leads and data for this brand.',
      onConfirm: () => unassignMutation.mutate(brandId),
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Assigned Brands</h2>
          <p className="text-sm text-muted-foreground">
            This team sees leads and sales data for these brands.
          </p>
        </div>
        {canManage && (
          <Button variant="outline" onClick={() => setAssignOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Assign Brand
          </Button>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 p-6 text-sm text-red-300">
            <AlertCircle className="h-4 w-4" />
            Failed to load brands
          </div>
        ) : mappings.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <Tag className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No brands assigned</p>
              <p className="text-xs text-muted-foreground mt-1">
                {canManage
                  ? 'Assign a brand so this team can see relevant leads and sales.'
                  : 'No brands are assigned to this team yet.'}
              </p>
            </div>
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Assign Brand
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {mappings.map((mapping) => (
              <div
                key={mapping.brandId}
                className="flex items-center justify-between px-5 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Tag className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm font-medium">{mapping.brand.name}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    Active
                  </Badge>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:bg-red-500/10 hover:text-red-300"
                    onClick={() => handleUnassign(mapping.brandId, mapping.brand.name)}
                    aria-label={`Remove ${mapping.brand.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AssignBrandModal
        open={assignOpen}
        teamId={teamId}
        assignedBrandIds={assignedBrandIds}
        onOpenChange={setAssignOpen}
      />
    </section>
  );
}
