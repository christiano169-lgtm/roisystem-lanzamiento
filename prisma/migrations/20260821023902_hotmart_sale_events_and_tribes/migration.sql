-- CreateTable
CREATE TABLE "hotmart_sale_events" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "transactionId" TEXT,
    "buyerEmail" TEXT,
    "productName" TEXT,
    "status" TEXT NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotmart_sale_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tribe_tags" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "tagName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tribe_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hotmart_sale_events_locationId_status_eventAt_idx" ON "hotmart_sale_events"("locationId", "status", "eventAt");

-- CreateIndex
CREATE INDEX "hotmart_sale_events_locationId_buyerEmail_idx" ON "hotmart_sale_events"("locationId", "buyerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "tribe_tags_locationId_tagName_key" ON "tribe_tags"("locationId", "tagName");

-- AddForeignKey
ALTER TABLE "hotmart_sale_events" ADD CONSTRAINT "hotmart_sale_events_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tribe_tags" ADD CONSTRAINT "tribe_tags_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
