-- CreateEnum
CREATE TYPE "GatewayType" AS ENUM ('AUTHORIZE_NET', 'STRIPE', 'MANUAL');

-- AlterTable
ALTER TABLE "PaymentTransaction" ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "gateway" "GatewayType" NOT NULL DEFAULT 'AUTHORIZE_NET';

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "gateway" "GatewayType" NOT NULL DEFAULT 'AUTHORIZE_NET',
ADD COLUMN     "gatewayCustomerId" TEXT,
ADD COLUMN     "gatewayPaymentMethodId" TEXT,
ADD COLUMN     "gatewaySubscriptionId" TEXT;

-- CreateIndex
CREATE INDEX "PaymentTransaction_gateway_idx" ON "PaymentTransaction"("gateway");
