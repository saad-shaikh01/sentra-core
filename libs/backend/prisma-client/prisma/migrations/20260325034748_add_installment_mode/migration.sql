-- CreateEnum
CREATE TYPE "InstallmentMode" AS ENUM ('EQUAL', 'CUSTOM');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "installmentMode" "InstallmentMode";
