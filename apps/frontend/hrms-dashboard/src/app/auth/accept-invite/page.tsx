'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react';
import { SpotlightBackground } from '@/components/spotlight-background';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { setTokens } from '@/lib/tokens';

type InviteInfo = {
  firstName: string;
  email: string;
  orgName: string;
};

type PageState = 'loading' | 'form' | 'invalid' | 'already-used';

const publicApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
});

function getErrorCode(error: unknown) {
  if (!axios.isAxiosError(error)) return null;
  return error.response?.data?.code ?? null;
}

function getErrorMessage(error: unknown) {
  if (!axios.isAxiosError(error)) return 'Something went wrong. Please try again.';
  const message = error.response?.data?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message[0] || 'Something went wrong. Please try again.';
  return 'Something went wrong. Please try again.';
}

function getPasswordScore(password: string) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[A-Z]/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

function strengthClasses(score: number) {
  if (score <= 1) return 'bg-red-400';
  if (score === 2) return 'bg-yellow-400';
  return 'bg-emerald-400';
}

function StateCard({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
          {icon}
        </div>
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {action ? <CardContent className="flex justify-center">{action}</CardContent> : null}
    </Card>
  );
}

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<PageState>('loading');
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadInviteInfo() {
      if (!token) {
        setState('invalid');
        return;
      }

      try {
        const response = await publicApi.get<{ data: InviteInfo }>('/auth/invite-info', {
          params: { token },
        });

        if (cancelled) return;

        setInviteInfo(response.data.data);
        setState('form');
      } catch (error) {
        if (cancelled) return;
        const code = getErrorCode(error);
        setState(code === 'ALREADY_USED' ? 'already-used' : 'invalid');
      }
    }

    loadInviteInfo();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const hasMinLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const passwordsMatch = password === confirmPassword;
  const passwordScore = getPasswordScore(password);
  const passwordWidth = `${Math.max(8, (passwordScore / 3) * 100)}%`;

  const formTitle = useMemo(() => {
    if (!inviteInfo?.orgName) return 'Complete your account setup';
    return `You've been invited to join ${inviteInfo.orgName}`;
  }, [inviteInfo?.orgName]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setState('invalid');
      return;
    }

    if (!hasMinLength || !hasNumber) {
      toast.error('Password must be at least 8 characters and include a number.');
      return;
    }

    if (!passwordsMatch) {
      toast.error('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await publicApi.post('/auth/accept-invite', {
        token,
        password,
        confirmPassword,
      });

      const payload = response.data?.data ?? response.data;
      setTokens(payload.accessToken, payload.refreshToken);
      router.push('/auth/select-app');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SpotlightBackground>
      <div className="flex min-h-screen items-center justify-center px-4">
        {state === 'loading' ? (
          <StateCard
            icon={<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
            title="Preparing your invite"
            description="Checking your invitation link."
          />
        ) : null}

        {state === 'invalid' ? (
          <StateCard
            icon={<CircleAlert className="h-6 w-6 text-red-300" />}
            title="Invalid or Expired Invitation"
            description="This invitation link is no longer valid. Contact your administrator to resend it."
          />
        ) : null}

        {state === 'already-used' ? (
          <StateCard
            icon={<CheckCircle2 className="h-6 w-6 text-emerald-300" />}
            title="Already Accepted"
            description="This invitation has already been used. Sign in to continue."
            action={
              <Button asChild>
                <Link href="/auth/login">Go to Login</Link>
              </Button>
            }
          />
        ) : null}

        {state === 'form' && inviteInfo ? (
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">{formTitle}</CardTitle>
              <CardDescription>Set your password to get started.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="invite-name">First name</Label>
                  <Input id="invite-name" value={inviteInfo.firstName} disabled readOnly />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input id="invite-email" value={inviteInfo.email} disabled readOnly />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-password">Password</Label>
                  <Input
                    id="invite-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <div className="h-2 rounded-full bg-white/10">
                    <div
                      className={`h-2 rounded-full transition-all ${strengthClasses(passwordScore)}`}
                      style={{ width: password ? passwordWidth : '8%' }}
                    />
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className={hasMinLength ? 'text-emerald-300' : undefined}>
                      ✓ At least 8 characters
                    </p>
                    <p className={hasNumber ? 'text-emerald-300' : undefined}>
                      ✓ At least 1 number
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-confirm-password">Confirm password</Label>
                  <Input
                    id="invite-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  {confirmPassword && !passwordsMatch ? (
                    <p className="text-xs text-red-300">Passwords do not match.</p>
                  ) : null}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || !password || !confirmPassword}
                >
                  {submitting ? 'Setting up account...' : 'Create Account'}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </SpotlightBackground>
  );
}
