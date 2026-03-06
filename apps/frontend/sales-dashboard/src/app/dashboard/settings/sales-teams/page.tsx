'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMembers } from '@/hooks/use-organization';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Pencil, Trash2, ShieldCheck, UserCheck } from 'lucide-react';
import { UserRole } from '@sentra-core/types';

interface TeamMember {
  userId: string;
  user: { id: string; name: string; email: string };
}

interface SalesTeam {
  id: string;
  name: string;
  description?: string;
  managers: TeamMember[];
  members: TeamMember[];
}

const BLANK_FORM = { name: '', description: '', managerIds: [] as string[], memberIds: [] as string[] };

export default function SalesTeamsPage() {
  const qc = useQueryClient();

  const { data: teams = [], isLoading } = useQuery<SalesTeam[]>({
    queryKey: ['sales-teams'],
    queryFn: () => api.getTeams(),
  });

  const { data: members = [] } = useMembers();

  const createMutation = useMutation({
    mutationFn: (dto: typeof BLANK_FORM) => api.createTeam(dto as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-teams'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: typeof BLANK_FORM }) => api.updateTeam(id, dto as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-teams'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteTeam(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-teams'] }),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const eligibleManagers = members.filter((m) =>
    [UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_MANAGER].includes(m.role as UserRole)
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setDialogOpen(true);
  };

  const openEdit = (team: SalesTeam) => {
    setEditingId(team.id);
    setForm({
      name: team.name,
      description: team.description ?? '',
      managerIds: team.managers.map((m) => m.userId),
      memberIds: team.members.map((m) => m.userId),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await updateMutation.mutateAsync({ id: editingId, dto: form });
    } else {
      await createMutation.mutateAsync(form);
    }
    setDialogOpen(false);
  };

  const toggleId = (field: 'managerIds' | 'memberIds', id: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(id) ? prev[field].filter((x) => x !== id) : [...prev[field], id],
    }));
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-2 border-primary/30" />
          <div className="absolute inset-0 h-12 w-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales Teams</h1>
          <p className="text-muted-foreground">Manage sales teams, assign managers and members</p>
        </div>
        <Button variant="glow" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Team
        </Button>
      </div>

      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg">No sales teams yet</p>
              <p className="text-muted-foreground text-sm">Create a team to group managers and agents together</p>
            </div>
            <Button variant="glow" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create First Team
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {teams.map((team, index) => (
            <motion.div
              key={team.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{team.name}</CardTitle>
                        {team.description && (
                          <CardDescription className="mt-0.5">{team.description}</CardDescription>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(team)} className="h-8 w-8">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteConfirm(team.id)}
                        className="h-8 w-8 hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Managers ({team.managers.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {team.managers.length === 0 ? (
                          <span className="text-xs text-muted-foreground">None assigned</span>
                        ) : (
                          team.managers.map((m) => (
                            <Badge key={m.userId} variant="outline" className="text-xs">
                              {m.user.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <UserCheck className="h-3.5 w-3.5" />
                        Members ({team.members.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {team.members.length === 0 ? (
                          <span className="text-xs text-muted-foreground">None assigned</span>
                        ) : (
                          team.members.map((m) => (
                            <Badge key={m.userId} variant="secondary" className="text-xs">
                              {m.user.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Team' : 'Create Sales Team'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update team details, managers, and members.' : 'Set up a new sales team with managers and agents.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="team-name">Team Name</Label>
              <Input
                id="team-name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. North Region Sales"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-desc">Description (optional)</Label>
              <Input
                id="team-desc"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Brief description of this team"
              />
            </div>

            {/* Managers */}
            <div className="space-y-2">
              <Label>Managers</Label>
              <p className="text-xs text-muted-foreground">Owners, Admins, and Sales Managers can be assigned as managers.</p>
              <div className="max-h-36 overflow-y-auto space-y-1 border border-white/10 rounded-lg p-2">
                {eligibleManagers.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">No eligible managers found.</p>
                ) : (
                  eligibleManagers.map((m) => {
                    const selected = form.managerIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleId('managerIds', m.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                          selected ? 'bg-primary/10 text-primary border border-primary/20' : 'hover:bg-white/5 text-muted-foreground'
                        }`}
                      >
                        <span>{m.name}</span>
                        {selected && <span className="text-xs font-bold">✓</span>}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Members */}
            <div className="space-y-2">
              <Label>Members (Agents)</Label>
              <div className="max-h-36 overflow-y-auto space-y-1 border border-white/10 rounded-lg p-2">
                {members.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">No members found.</p>
                ) : (
                  members.map((m) => {
                    const selected = form.memberIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleId('memberIds', m.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                          selected ? 'bg-primary/10 text-primary border border-primary/20' : 'hover:bg-white/5 text-muted-foreground'
                        }`}
                      >
                        <span>{m.name}</span>
                        {selected && <span className="text-xs font-bold">✓</span>}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !form.name.trim()}>
                {isPending ? 'Saving...' : editingId ? 'Save Changes' : 'Create Team'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Team</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this team? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={async () => {
                if (deleteConfirm) {
                  await deleteMutation.mutateAsync(deleteConfirm);
                  setDeleteConfirm(null);
                }
              }}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
