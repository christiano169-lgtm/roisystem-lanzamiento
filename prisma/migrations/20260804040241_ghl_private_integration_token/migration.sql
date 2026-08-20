/*
  Warnings:

  - You are about to drop the `ghl_connections` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ghl_connections" DROP CONSTRAINT "ghl_connections_tenantId_fkey";

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "ghlPitAddedAt" TIMESTAMP(3),
ADD COLUMN     "ghlPitCipher" TEXT;

-- DropTable
DROP TABLE "ghl_connections";
