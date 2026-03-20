'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Phone, Briefcase, FileText, Camera, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useUpdateProfile, useUploadAvatar } from '@/hooks/use-profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

export default function ProfileSettingsPage() {
  const { user } = useAuth();
  const updateProfileMutation = useUpdateProfile();
  const uploadAvatarMutation = useUploadAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    avatarUrl: '',
    jobTitle: '',
    phone: '',
    bio: '',
  });

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        avatarUrl: user.avatarUrl || '',
        jobTitle: user.jobTitle || '',
        phone: user.phone || '',
        bio: user.bio || '',
      });
    }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(formData);
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Show local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    // Upload to Wasabi
    uploadAvatarMutation.mutate(file, {
      onSuccess: (updatedUser) => {
        setFormData((prev) => ({ ...prev, avatarUrl: updatedUser.avatarUrl ?? '' }));
        URL.revokeObjectURL(objectUrl);
        setPreviewUrl(null);
      },
      onError: () => {
        URL.revokeObjectURL(objectUrl);
        setPreviewUrl(null);
      },
    });
    // Reset input so same file can be re-selected
    e.target.value = '';
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6 max-w-2xl"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
        <p className="text-muted-foreground">
          Manage your personal information
        </p>
      </div>

      {/* Profile Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>Profile Overview</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
            {/* Clickable avatar upload */}
            <div className="relative shrink-0 group">
              <Avatar className="h-24 w-24 ring-4 ring-primary/20">
                <AvatarImage src={previewUrl ?? formData.avatarUrl} />
                <AvatarFallback className="text-xl bg-primary/20 text-primary">
                  {getInitials(formData.name || 'User')}
                </AvatarFallback>
              </Avatar>
              {/* Overlay */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadAvatarMutation.isPending}
                className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-not-allowed"
              >
                {uploadAvatarMutation.isPending ? (
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                ) : (
                  <Camera className="h-6 w-6 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
            </div>

            <div className="space-y-1 min-w-0 flex-1">
              <h3 className="text-2xl font-semibold truncate">{user?.name}</h3>
              <p className="text-muted-foreground flex items-center justify-center sm:justify-start gap-2 truncate">
                <Mail className="h-4 w-4 shrink-0" />
                {user?.email}
              </p>
              <div className="flex justify-center sm:justify-start">
                <Badge variant={getRoleBadgeVariant(user?.role || '')} className="mt-2">
                  {formatRole(user?.role || '')}
                </Badge>
              </div>
              {uploadAvatarMutation.isSuccess && (
                <p className="text-xs text-emerald-400 mt-1">Profile picture updated!</p>
              )}
              {uploadAvatarMutation.isError && (
                <p className="text-xs text-red-400 mt-1">Failed to upload picture. Try again.</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Click the avatar to change your photo</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Profile Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Edit Profile</CardTitle>
              <CardDescription>
                Update your profile information. Email changes are not allowed.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {updateProfileMutation.isSuccess && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-3 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg"
              >
                Profile updated successfully!
              </motion.div>
            )}

            {updateProfileMutation.error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg"
              >
                {updateProfileMutation.error.message || 'Failed to update profile'}
              </motion.div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={user?.email || ''}
                disabled
                className="opacity-60"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed. Contact support if needed.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                Full Name
              </Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="jobTitle" className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                Job Title
              </Label>
              <Input
                id="jobTitle"
                name="jobTitle"
                placeholder="e.g., Sales Manager"
                value={formData.jobTitle}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                Phone Number
              </Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <textarea
                id="bio"
                name="bio"
                rows={3}
                placeholder="Tell us about yourself..."
                value={formData.bio}
                onChange={handleChange}
                className="flex w-full rounded-lg px-3 py-2 text-sm bg-white/5 border border-white/10 backdrop-blur-sm text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:outline-none focus:bg-white/10 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <Button
              type="submit"
              variant="glow"
              disabled={updateProfileMutation.isPending}
            >
              {updateProfileMutation.isPending ? (
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
                  Saving...
                </span>
              ) : (
                'Save Changes'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
