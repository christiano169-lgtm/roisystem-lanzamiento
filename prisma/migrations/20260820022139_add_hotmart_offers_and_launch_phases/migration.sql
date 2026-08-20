-- CreateEnum
CREATE TYPE "HotmartOfferType" AS ENUM ('general', 'vip', 'upgrade', 'order_bump');

-- CreateTable
CREATE TABLE "hotmart_offers" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hotmartProductName" TEXT NOT NULL,
    "offerType" "HotmartOfferType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotmart_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "launch_phases" (
    "id" TEXT NOT NULL,
    "launchId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "launch_phases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hotmart_offers_locationId_hotmartProductName_key" ON "hotmart_offers"("locationId", "hotmartProductName");

-- AddForeignKey
ALTER TABLE "hotmart_offers" ADD CONSTRAINT "hotmart_offers_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "launch_phases" ADD CONSTRAINT "launch_phases_launchId_fkey" FOREIGN KEY ("launchId") REFERENCES "launches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
