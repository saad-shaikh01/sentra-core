-- AlterTable
ALTER TABLE "Lead"
ADD COLUMN     "convertedAt" TIMESTAMP(3);

ALTER TABLE "Sale"
ADD COLUMN     "saleDate" TIMESTAMP(3);

ALTER TABLE "Invoice"
ADD COLUMN     "invoiceDate" TIMESTAMP(3),
ADD COLUMN     "paidAt" TIMESTAMP(3);

-- Backfill canonical business/reporting dates from legacy data.
UPDATE "Sale"
SET "saleDate" = "createdAt"
WHERE "saleDate" IS NULL;

UPDATE "Lead"
SET "convertedAt" = COALESCE("updatedAt", "createdAt")
WHERE "convertedClientId" IS NOT NULL
  AND "convertedAt" IS NULL;

UPDATE "Invoice" AS i
SET "invoiceDate" = COALESCE(s."saleDate", s."createdAt", i."createdAt")
FROM "Sale" AS s
WHERE i."saleId" = s."id"
  AND i."invoiceDate" IS NULL;

UPDATE "Invoice"
SET "invoiceDate" = "createdAt"
WHERE "invoiceDate" IS NULL;

UPDATE "Invoice"
SET "paidAt" = "updatedAt"
WHERE "status" = 'PAID'
  AND "paidAt" IS NULL;

-- Enforce new non-null business dates after backfill.
ALTER TABLE "Sale"
ALTER COLUMN "saleDate" SET NOT NULL,
ALTER COLUMN "saleDate" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Invoice"
ALTER COLUMN "invoiceDate" SET NOT NULL,
ALTER COLUMN "invoiceDate" SET DEFAULT CURRENT_TIMESTAMP;

-- Indexes
CREATE INDEX "Lead_organizationId_leadDate_idx" ON "Lead"("organizationId", "leadDate");
CREATE INDEX "Lead_organizationId_convertedAt_idx" ON "Lead"("organizationId", "convertedAt");
CREATE INDEX "Sale_organizationId_saleDate_idx" ON "Sale"("organizationId", "saleDate");
CREATE INDEX "Invoice_saleId_invoiceDate_idx" ON "Invoice"("saleId", "invoiceDate");
CREATE INDEX "Invoice_status_paidAt_idx" ON "Invoice"("status", "paidAt");
