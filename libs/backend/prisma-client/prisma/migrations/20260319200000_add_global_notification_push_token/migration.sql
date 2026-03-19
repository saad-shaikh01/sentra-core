-- CreateEnum
CREATE TYPE "GlobalNotificationType" AS ENUM ('SALE_STATUS_CHANGED', 'PAYMENT_RECEIVED', 'PAYMENT_FAILED', 'INVOICE_OVERDUE', 'CHARGEBACK_FILED', 'TASK_ASSIGNED', 'TASK_DUE_SOON', 'COMMENT_ADDED', 'PROJECT_STATUS_CHANGED', 'APPROVAL_REQUESTED', 'MENTION', 'SYSTEM_ALERT');

-- CreateEnum
CREATE TYPE "AppModule" AS ENUM ('SALES', 'PM', 'HRMS', 'COMM', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('WEB', 'ANDROID', 'IOS');

-- CreateTable
CREATE TABLE "GlobalNotification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "GlobalNotificationType" NOT NULL,
    "module" "AppModule" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "url" TEXT,
    "isMention" BOOLEAN NOT NULL DEFAULT false,
    "mentionContext" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "PushPlatform" NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GlobalNotification_organizationId_recipientId_isRead_created_idx" ON "GlobalNotification"("organizationId", "recipientId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "GlobalNotification_recipientId_createdAt_idx" ON "GlobalNotification"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "GlobalNotification_organizationId_type_idx" ON "GlobalNotification"("organizationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_userId_organizationId_idx" ON "PushToken"("userId", "organizationId");
