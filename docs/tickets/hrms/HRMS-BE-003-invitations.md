# HRMS-BE-003: Invitations Module (Send, Resend, Cancel, Accept)

## Overview
Implement the invitation flow: an admin creates an employee record, sends them an invite link via email, and the invitee sets their password through the link. Also covers resend invite, cancel invite, and the public accept-invite endpoint.

## Background / Context
The current `core-service` has a basic invitation flow tied to organization creation. This ticket creates a proper invitation module in HRMS that works independently of org setup, supports resending, and tracks invite status per employee.

## Acceptance Criteria
- [ ] `POST /hrms/employees/:id/invite` generates a secure invite token, stores it hashed in DB, sends invite email
- [ ] `POST /hrms/employees/:id/invite/resend` invalidates old token, generates new one, resends email
- [ ] `DELETE /hrms/employees/:id/invite` cancels a pending invitation
- [ ] `GET /hrms/invitations/pending` returns all pending invitations for the org (admin view)
- [ ] `POST /auth/accept-invite` (core-service, public) accepts the invite: validates token, lets user set password, sets status to ACTIVE
- [ ] Invite token expires after 72 hours
- [ ] Accepted or expired tokens cannot be reused
- [ ] Invite email contains: inviter name, organization name, app name, invite link
- [ ] Inviting an already ACTIVE user returns 400 (they're already set up)
- [ ] Admin who sends invite is recorded (for audit)

## Technical Specification

### Schema

```prisma
model UserInvitation {
  id              String    @id @default(cuid())
  userId          String    @unique         // one pending invite per user
  organizationId  String
  tokenHash       String                    // SHA-256 of raw token
  invitedBy       String                   // userId of admin who sent invite
  invitedAt       DateTime  @default(now())
  expiresAt       DateTime                  // invitedAt + 72h
  acceptedAt      DateTime?
  cancelledAt     DateTime?
  emailSentAt     DateTime?

  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([organizationId])
}
```

### Invite Service

```typescript
// invitations.service.ts

async sendInvite(userId: string, orgId: string, adminId: string) {
  const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId: orgId } });
  if (!user) throw new NotFoundException('Employee not found');
  if (user.status === 'ACTIVE') throw new BadRequestException('User is already active');
  if (user.status === 'DEACTIVATED') throw new BadRequestException('Cannot invite a deactivated user');

  // Cancel any existing pending invite
  await this.prisma.userInvitation.updateMany({
    where: { userId, cancelledAt: null, acceptedAt: null },
    data: { cancelledAt: new Date() }
  });

  // Generate raw token
  const rawToken = randomBytes(32).toString('hex'); // 64-char hex
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

  await this.prisma.userInvitation.create({
    data: {
      userId,
      organizationId: orgId,
      tokenHash,
      invitedBy: adminId,
      expiresAt,
    }
  });

  // Build invite URL
  const inviteUrl = `${process.env.APP_BASE_URL}/auth/accept-invite?token=${rawToken}`;

  // Send email
  await this.mailerService.sendInviteEmail({
    to: user.email,
    firstName: user.firstName,
    inviterName: await this.getAdminName(adminId),
    organizationName: await this.getOrgName(orgId),
    inviteUrl,
    expiresIn: '72 hours',
  });

  await this.prisma.userInvitation.updateMany({
    where: { userId, tokenHash },
    data: { emailSentAt: new Date() }
  });

  await this.auditService.log({
    action: 'USER_INVITED',
    actorId: adminId,
    targetUserId: userId,
    organizationId: orgId,
    metadata: { email: user.email }
  });

  return { message: 'Invitation sent', expiresAt };
}

async resendInvite(userId: string, orgId: string, adminId: string) {
  // Same as sendInvite — it cancels old and creates new
  return this.sendInvite(userId, orgId, adminId);
}

async cancelInvite(userId: string, orgId: string, adminId: string) {
  const result = await this.prisma.userInvitation.updateMany({
    where: { userId, organizationId: orgId, cancelledAt: null, acceptedAt: null },
    data: { cancelledAt: new Date() }
  });
  if (result.count === 0) throw new NotFoundException('No pending invitation found');

  await this.auditService.log({
    action: 'USER_INVITE_CANCELLED',
    actorId: adminId,
    targetUserId: userId,
    organizationId: orgId,
  });

  return { message: 'Invitation cancelled' };
}
```

### Accept Invite (core-service: public endpoint)

```typescript
// POST /auth/accept-invite
// Body: { token: string, password: string, confirmPassword: string }
// NO auth required — this is how users get in for the first time

async acceptInvite(token: string, password: string, confirmPassword: string) {
  if (password !== confirmPassword) throw new BadRequestException('Passwords do not match');

  // Password validation
  if (password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
  // Optional: check for complexity (uppercase, number, special char)

  const tokenHash = sha256(token);
  const invitation = await this.prisma.userInvitation.findFirst({
    where: { tokenHash },
    include: { user: true }
  });

  if (!invitation) throw new BadRequestException('Invalid or expired invitation link');
  if (invitation.acceptedAt) throw new BadRequestException('This invitation has already been used');
  if (invitation.cancelledAt) throw new BadRequestException('This invitation has been cancelled');
  if (invitation.expiresAt < new Date()) throw new BadRequestException('This invitation has expired. Please ask your admin to resend it.');

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Update user
  await this.prisma.user.update({
    where: { id: invitation.userId },
    data: { password: hashedPassword, status: 'ACTIVE' }
  });

  // Mark invitation as accepted
  await this.prisma.userInvitation.update({
    where: { id: invitation.id },
    data: { acceptedAt: new Date() }
  });

  await this.auditService.log({
    action: 'USER_INVITE_ACCEPTED',
    actorId: invitation.userId,
    targetUserId: invitation.userId,
    organizationId: invitation.organizationId,
  });

  // Auto-login: issue token pair so user lands directly in their app
  return this.authService.loginAfterAccept(invitation.user, invitation.organizationId);
}
```

### Email Template: Invite Email

```
Subject: You've been invited to {OrgName} on Sentra

Hi {FirstName},

{InviterName} has invited you to join {OrgName}'s workspace on Sentra.

Click the button below to set up your account:

[Accept Invitation]  ← links to inviteUrl

This invitation expires in 72 hours.

If you didn't expect this invitation, you can ignore this email.
```

### GET /hrms/invitations/pending

```typescript
// Returns: list of users with pending invitations

async getPendingInvitations(orgId: string, page: number, limit: number) {
  const where = {
    organizationId: orgId,
    acceptedAt: null,
    cancelledAt: null,
    expiresAt: { gt: new Date() } // not expired
  };

  const [invites, total] = await this.prisma.$transaction([
    this.prisma.userInvitation.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } }
      },
      orderBy: { invitedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    this.prisma.userInvitation.count({ where })
  ]);

  return {
    data: invites.map(inv => ({
      invitationId: inv.id,
      userId: inv.userId,
      name: `${inv.user.firstName} ${inv.user.lastName}`,
      email: inv.user.email,
      invitedAt: inv.invitedAt,
      expiresAt: inv.expiresAt,
      expiresIn: formatDistanceToNow(inv.expiresAt, { addSuffix: true }) // "in 48 hours"
    })),
    meta: { total, page, limit, pages: Math.ceil(total / limit) }
  };
}
```

## Testing Requirements

### Unit Tests
- `sendInvite()` throws if user is ACTIVE
- `sendInvite()` throws if user is DEACTIVATED
- `sendInvite()` cancels previous pending invite before creating new one
- `acceptInvite()` throws if token not found
- `acceptInvite()` throws if invitation already accepted
- `acceptInvite()` throws if invitation expired
- `acceptInvite()` throws if invitation cancelled
- `acceptInvite()` throws if passwords don't match
- Token is never stored in plain text — only SHA-256 hash

### Integration Tests
- Create user → send invite → accept invite → user status is ACTIVE
- Send invite → resend invite → original token is cancelled → old token rejected
- Send invite → cancel invite → token rejected
- Accept invite → auto-login tokens returned → can call authenticated endpoints

### Email Tests (manual/snapshot)
- Invite email contains correct name, org name, invite URL
- Invite URL contains the raw token (not the hash)
- Expired invite error message suggests contacting admin

### Edge Cases
- `token` param is empty string → treat as not found (no DB lookup)
- Invite expires between "send" and "accept" → clear error message
- Admin resends invite on same day → old invite cancelled, new 72h window starts
- Two admins both try to send invite simultaneously → only one succeeds (unique constraint on userId in UserInvitation)
- Invite email fails to send (mail server down) → rollback invitation record, return 503
