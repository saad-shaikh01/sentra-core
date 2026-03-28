-- Add rich content snapshots for product packages and sale packages
ALTER TABLE "ProductPackage"
ADD COLUMN "content" TEXT;

ALTER TABLE "SalePackage"
ADD COLUMN "content" TEXT;
