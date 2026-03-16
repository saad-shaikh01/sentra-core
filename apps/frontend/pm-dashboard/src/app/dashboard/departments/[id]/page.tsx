'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Users, Plus, Trash2, Star } from 'lucide-react';

export default function DepartmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMemberId, setNewMemberId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'LEAD' | 'MEMBER'>('MEMBER');

  const { data: deptRes } = useQuery({
    queryKey: ['pm', 'departments', id],
    queryFn: () => api.fetch<any>(`/departments/${id}`, { service: 'pm' }),
    staleTime: 60_000,
    enabled: !!id,
  });
  const dept = (deptRes as any)?.data;

  const { data: membersRes, isLoading } = useQuery({
    queryKey: ['pm', 'departments', id, 'members'],
    queryFn: () => api.fetch<any>(`/departments/${id}/members`, { service: 'pm' }),
    staleTime: 60_000,
    enabled: !!id,
  });
  const members = (membersRes as any)?.data ?? [];

  const addMember = useMutation({
    mutationFn: () => api.addDepartmentMember(id, { userId: newMemberId, role: newMemberRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm', 'departments', id] });
      setShowAddModal(false);
      setNewMemberId('');
      toast.success('Member added');
    },
    onError: (e: Error) => toast.error('Failed to add member', e.message),
  });

  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.updateDepartmentMember(id, userId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm', 'departments', id] });
      toast.success('Role updated');
    },
    onError: (e: Error) => toast.error('Failed to update role', e.message),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.removeDepartmentMember(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm', 'departments', id] });
      toast.success('Member removed');
    },
    onError: (e: Error) => toast.error('Failed to remove member', e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={dept?.name ?? 'Department'}
        description={`Manage members of the ${dept?.name ?? ''} department.`}
      />

      <Card className="bg-white/[0.02] border-white/10">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" /> Members ({members.length})
          </CardTitle>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="h-3 w-3 mr-1" /> Add Member
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />)}
            </div>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No members yet</p>
          ) : (
            <div className="space-y-2">
              {members.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center gap-3">
                    {m.role === 'LEAD' && <Star className="h-3.5 w-3.5 text-amber-400" />}
                    <span className="text-sm font-mono">{m.userId.slice(0, 8)}...</span>
                    <Badge variant="outline" className={`text-xs ${m.role === 'LEAD' ? 'border-amber-500/30 text-amber-400' : 'border-white/10'}`}>
                      {m.role}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={m.role}
                      onValueChange={(v) => updateRole.mutate({ userId: m.userId, role: v })}
                    >
                      <SelectTrigger className="w-28 h-7 text-xs bg-white/5 border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LEAD">Lead</SelectItem>
                        <SelectItem value="MEMBER">Member</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => removeMember.mutate(m.userId)}
                      disabled={removeMember.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-black/80 backdrop-blur-2xl border-white/10">
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">User ID</label>
              <Input
                placeholder="Enter user UUID"
                value={newMemberId}
                onChange={(e) => setNewMemberId(e.target.value)}
                className="bg-white/5 border-white/10"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Role</label>
              <Select value={newMemberRole} onValueChange={(v) => setNewMemberRole(v as any)}>
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="LEAD">Lead</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={!newMemberId.trim() || addMember.isPending}
              onClick={() => addMember.mutate()}
            >
              {addMember.isPending ? 'Adding...' : 'Add Member'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
