CREATE TABLE "Notification" (
  "id"             TEXT NOT NULL,
  "type"           TEXT NOT NULL,
  "message"        TEXT NOT NULL,
  "saleId"         TEXT,
  "organizationId" TEXT NOT NULL,
  "recipientId"    TEXT NOT NULL,
  "isRead"         BOOLEAN NOT NULL DEFAULT false,
  "data"           JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_organizationId_recipientId_idx" ON "Notification"("organizationId", "recipientId");
CREATE INDEX "Notification_organizationId_type_idx" ON "Notification"("organizationId", "type");

DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('PAYMENT_FAILED', 'INVOICE_OVERDUE', 'SALE_STATUS_CHANGED', 'CHARGEBACK_FILED', 'PAYMENT_RECEIVED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType" USING "type"::"NotificationType";
