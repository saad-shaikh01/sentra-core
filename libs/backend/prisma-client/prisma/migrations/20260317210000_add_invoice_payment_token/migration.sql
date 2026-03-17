ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paymentToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_paymentToken_key" ON "Invoice"("paymentToken");
