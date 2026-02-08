'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/use-auth';
import {
  useMembers,
  useUpdateMemberRole,
  useRemoveMember,
  useInvitations,
  useSendInvitation,
  useCancelInvitation,
} from '@/hooks/use-organization';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus, Trash2, Users, Mail } from 'lucide-react';
import { UserRole, ROLE_DESCRIPTIONS, IOrganizationMember } from '@sentra-core/types';

const ROLES = [
  { value: UserRole.ADMIN, label: 'Admin' },
  { value: UserRole.SALES_MANAGER, label: 'Sales Manager' },
  { value: UserRole.PROJECT_MANAGER, label: 'Project Manager' },
  { value: UserRole.FRONTSELL_AGENT, label: 'Frontsell Agent' },
  { value: UserRole.UPSELL_AGENT, label: 'Upsell Agent' },
];

export default function TeamSettingsPage() {
  const { user } = useAuth();
  const { data: members = [], isLoading: membersLoading } = useMembers();
  const { data: pendingInvites = [], isLoading: invitesLoading } = useInvitations();

  const updateRoleMutation = useUpdateMemberRole();
  const removeMemberMutation = useRemoveMember();
  const sendInviteMutation = useSendInvitation();
  const cancelInviteMutation = useCancelInvitation();

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: UserRole.FRONTSELL_AGENT });

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    sendInviteMutation.mutate(
      { email: inviteForm.email, role: inviteForm.role },
      {
        onSuccess: () => {
          setInviteForm({ email: '', role: UserRole.FRONTSELL_AGENT });
          setInviteDialogOpen(false);
        },
      }
    );
  };

  const handleRoleChange = (memberId: string, newRole: string) => {
    updateRoleMutation.mutate({ userId: memberId, role: newRole });
  };

  const handleRemoveMember = (memberId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;
    removeMemberMutation.mutate(memberId);
  };

  const handleCancelInvite = (inviteId: string) => {
    cancelInviteMutation.mutate(inviteId);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleBadgeVariant = (role: string) => {
    const variants: Record<string, any> = {
      OWNER: 'owner',
      ADMIN: 'admin',
      SALES_MANAGER: 'sales-manager',
      PROJECT_MANAGER: 'project-manager',
      FRONTSELL_AGENT: 'frontsell-agent',
      UPSELL_AGENT: 'upsell-agent',
    };
    return variants[role] || 'secondary';
  };

  const formatRole = (role: string) => {
    return role.replace(/_/g, ' ');
  };

  const canEditMember = (member: IOrganizationMember) => {
    if (member.id === user?.id) return false;
    if (member.role === UserRole.OWNER) return false;
    if (user?.role === UserRole.OWNER) return true;
    if (user?.role === UserRole.ADMIN && member.role !== UserRole.ADMIN) return true;
    return false;
  };

  const isLoading = membersLoading || invitesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-primary/30" />
            <div className="absolute inset-0 h-12 w-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Loading team...</p>
        </motion.div>
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
          <h1 className="text-3xl font-bold tracking-tight">Team Management</h1>
          <p className="text-muted-foreground">
            Manage your team members and their roles
          </p>
        </div>
        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="glow">
              <UserPlus className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation to join your organization
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4">
              {sendInviteMutation.error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="p-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg"
                >
                  {sendInviteMutation.error.message || 'Failed to send invitation'}
                </motion.div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="colleague@example.com"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm((prev) => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={inviteForm.role}
                  onValueChange={(value) =>
                    setInviteForm((prev) => ({ ...prev, role: value as UserRole }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        <div>
                          <div className="font-medium">{role.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {ROLE_DESCRIPTIONS[role.value]}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setInviteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={sendInviteMutation.isPending}>
                  {sendInviteMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Sending...
                    </span>
                  ) : (
                    'Send Invitation'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Team Members */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Team Members ({members.length})</CardTitle>
              <CardDescription>Active members in your organization</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.map((member, index) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <Avatar className="h-10 w-10 ring-2 ring-primary/20">
                    <AvatarImage src={member.avatarUrl} />
                    <AvatarFallback className="bg-primary/20 text-primary">
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{member.name}</p>
                      {member.id === user?.id && (
                        <Badge variant="outline" className="text-xs">You</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                    {member.jobTitle && (
                      <p className="text-xs text-muted-foreground">{member.jobTitle}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {canEditMember(member) ? (
                    <Select
                      value={member.role}
                      onValueChange={(value) => handleRoleChange(member.id, value)}
                      disabled={updateRoleMutation.isPending}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={getRoleBadgeVariant(member.role)}>
                      {formatRole(member.role)}
                    </Badge>
                  )}
                  {canEditMember(member) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveMember(member.id)}
                      className="hover:bg-red-500/10 hover:text-red-400"
                      disabled={removeMemberMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-warning/20 flex items-center justify-center">
                <Mail className="h-5 w-5 text-warning" />
              </div>
              <div>
                <CardTitle>Pending Invitations ({pendingInvites.length})</CardTitle>
                <CardDescription>Invitations waiting to be accepted</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingInvites.map((invite, index) => (
                <motion.div
                  key={invite.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10"
                >
                  <div>
                    <p className="font-medium">{invite.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={getRoleBadgeVariant(invite.role)}>
                        {formatRole(invite.role)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelInvite(invite.id)}
                    className="hover:bg-red-500/10 hover:text-red-400"
                    disabled={cancelInviteMutation.isPending}
                  >
                    Cancel
                  </Button>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
