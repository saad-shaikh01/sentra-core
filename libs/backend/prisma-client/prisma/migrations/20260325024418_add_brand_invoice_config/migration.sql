-- CreateTable
CREATE TABLE "BrandInvoiceConfig" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "billingEmail" TEXT,
    "supportEmail" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "dueDays" INTEGER NOT NULL DEFAULT 30,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "invoiceTerms" TEXT,
    "invoiceNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandInvoiceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandInvoiceConfig_brandId_key" ON "BrandInvoiceConfig"("brandId");

-- AddForeignKey
ALTER TABLE "BrandInvoiceConfig" ADD CONSTRAINT "BrandInvoiceConfig_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
