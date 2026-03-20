-- CreateEnum
CREATE TYPE "PackageCategory" AS ENUM ('PUBLISHING', 'WRITING', 'DESIGN', 'EDITING');

-- AlterTable
ALTER TABLE "PackageItem" ALTER COLUMN "unitPrice" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProductPackage" ADD COLUMN     "category" "PackageCategory",
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "price" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "SalePackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "category" TEXT,
    "saleId" TEXT NOT NULL,
    "packageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalePackageService" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "salePackageId" TEXT NOT NULL,

    CONSTRAINT "SalePackageService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalePackage_saleId_key" ON "SalePackage"("saleId");

-- CreateIndex
CREATE INDEX "SalePackageService_salePackageId_idx" ON "SalePackageService"("salePackageId");

-- CreateIndex
CREATE INDEX "ProductPackage_organizationId_category_idx" ON "ProductPackage"("organizationId", "category");

-- AddForeignKey
ALTER TABLE "SalePackage" ADD CONSTRAINT "SalePackage_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalePackage" ADD CONSTRAINT "SalePackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ProductPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalePackageService" ADD CONSTRAINT "SalePackageService_salePackageId_fkey" FOREIGN KEY ("salePackageId") REFERENCES "SalePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
