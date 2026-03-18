CREATE TABLE "UserInvitation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "invitedBy" TEXT NOT NULL,
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "emailSentAt" TIMESTAMP(3),

  CONSTRAINT "UserInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserInvitation_userId_key" ON "UserInvitation"("userId");
CREATE INDEX "UserInvitation_organizationId_idx" ON "UserInvitation"("organizationId");
CREATE INDEX "UserInvitation_tokenHash_idx" ON "UserInvitation"("tokenHash");

ALTER TABLE "UserInvitation"
ADD CONSTRAINT "UserInvitation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
