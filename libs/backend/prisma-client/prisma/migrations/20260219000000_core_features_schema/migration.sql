-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'PROPOSAL', 'CLOSED');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('STATUS_CHANGE', 'NOTE', 'ASSIGNMENT_CHANGE', 'CONVERSION', 'CREATED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('ONE_TIME', 'RECURRING', 'REFUND');

-- ============================================
-- Rename Order → Sale (preserve data)
-- ============================================

-- Drop existing foreign keys on Order
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_orderId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT "Order_clientId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT "Order_brandId_fkey";

-- Rename Order table to Sale
ALTER TABLE "Order" RENAME TO "Sale";

-- Rename Invoice.orderId to Invoice.saleId
ALTER TABLE "Invoice" RENAME COLUMN "orderId" TO "saleId";

-- Add new columns to Sale
ALTER TABLE "Sale" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "description" TEXT;
ALTER TABLE "Sale" ADD COLUMN "customerProfileId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "paymentProfileId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "subscriptionId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Change Sale.status from TEXT to SaleStatus enum
ALTER TABLE "Sale" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Sale" ALTER COLUMN "status" TYPE "SaleStatus" USING "status"::"SaleStatus";
ALTER TABLE "Sale" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- Restore foreign keys on Sale
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex on Sale
CREATE INDEX "Sale_organizationId_brandId_status_idx" ON "Sale"("organizationId", "brandId", "status");
CREATE INDEX "Sale_clientId_idx" ON "Sale"("clientId");
CREATE INDEX "Sale_subscriptionId_idx" ON "Sale"("subscriptionId");

-- ============================================
-- Update Lead: change status from TEXT to LeadStatus enum
-- ============================================
ALTER TABLE "Lead" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Lead" ALTER COLUMN "status" TYPE "LeadStatus" USING "status"::"LeadStatus";
ALTER TABLE "Lead" ALTER COLUMN "status" SET DEFAULT 'NEW';

-- ============================================
-- Update Client
-- ============================================

-- Drop global unique constraint on Client.email
DROP INDEX "Client_email_key";

-- Add new columns to Client
ALTER TABLE "Client" ADD COLUMN "contactName" TEXT;
ALTER TABLE "Client" ADD COLUMN "address" TEXT;
ALTER TABLE "Client" ADD COLUMN "notes" TEXT;
ALTER TABLE "Client" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add unique constraint per organization
CREATE UNIQUE INDEX "Client_email_organizationId_key" ON "Client"("email", "organizationId");

-- ============================================
-- Update Invoice
-- ============================================

-- Add new columns to Invoice
ALTER TABLE "Invoice" ADD COLUMN "invoiceNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "notes" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Invoice" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Generate invoice numbers for existing rows (if any)
UPDATE "Invoice" SET "invoiceNumber" = 'INV-LEGACY-' || "id" WHERE "invoiceNumber" IS NULL;

-- Make invoiceNumber NOT NULL and UNIQUE
ALTER TABLE "Invoice" ALTER COLUMN "invoiceNumber" SET NOT NULL;
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- Change Invoice.status from TEXT to InvoiceStatus enum
ALTER TABLE "Invoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "status" TYPE "InvoiceStatus" USING "status"::"InvoiceStatus";
ALTER TABLE "Invoice" ALTER COLUMN "status" SET DEFAULT 'UNPAID';

-- Restore Invoice FK to Sale
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex on Invoice
CREATE INDEX "Invoice_saleId_idx" ON "Invoice"("saleId");
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- ============================================
-- Create LeadActivity table
-- ============================================
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "type" "LeadActivityType" NOT NULL,
    "data" JSONB NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");

ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================
-- Create PaymentTransaction table
-- ============================================
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "responseCode" TEXT,
    "responseMessage" TEXT,
    "saleId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentTransaction_saleId_idx" ON "PaymentTransaction"("saleId");
CREATE INDEX "PaymentTransaction_transactionId_idx" ON "PaymentTransaction"("transactionId");

ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
