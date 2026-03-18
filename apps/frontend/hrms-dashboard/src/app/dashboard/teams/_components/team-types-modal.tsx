'use client';

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { hrmsApi } from '@/lib/api';
import { TeamTypeBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TeamTypeRecord } from './types';

export function TeamTypesModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [newTypeName, setNewTypeName] = useState('');
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const typesQuery = useQuery({
    queryKey: ['team-types'],
    queryFn: async () => {
      const response = await hrmsApi.get<{ data: TeamTypeRecord[] }>('/team-types');
      return response.data;
    },
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: () => hrmsApi.post('/team-types', { name: newTypeName.trim() }),
    onSuccess: () => {
      toast.success('Team type created.');
      setNewTypeName('');
      queryClient.invalidateQueries({ queryKey: ['team-types'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create team type.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => hrmsApi.patch(`/team-types/${editingTypeId}`, { name: editingName.trim() }),
    onSuccess: () => {
      toast.success('Team type updated.');
      setEditingTypeId(null);
      setEditingName('');
      queryClient.invalidateQueries({ queryKey: ['team-types'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update team type.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (typeId: string) => hrmsApi.delete(`/team-types/${typeId}`),
    onSuccess: () => {
      toast.success('Team type deleted.');
      queryClient.invalidateQueries({ queryKey: ['team-types'] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to delete team type.';
      toast.error(
        message.includes('in use') ? 'Cannot delete: teams are using this type' : message,
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Team Types</DialogTitle>
          <DialogDescription>System types are read-only. Custom types can be edited or deleted.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {(typesQuery.data ?? []).map((type) => (
            <div
              key={type.id}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3"
            >
              <div className="flex items-center gap-2">
                <TeamTypeBadge type={type} />
                {type.isSystem ? (
                  <span className="text-xs text-muted-foreground">(system)</span>
                ) : null}
              </div>

              {!type.isSystem ? (
                editingTypeId === type.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      className="h-8 w-40"
                    />
                    <Button size="sm" onClick={() => updateMutation.mutate()}>
                      Save
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditingTypeId(type.id);
                        setEditingName(type.name);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-300"
                      onClick={() => deleteMutation.mutate(type.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              ) : null}
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t border-white/10 pt-4">
          <p className="text-sm font-medium">Create custom type</p>
          <div className="flex gap-2">
            <Input
              value={newTypeName}
              onChange={(event) => setNewTypeName(event.target.value)}
              placeholder="New type name"
            />
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newTypeName.trim() || createMutation.isPending}
            >
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
