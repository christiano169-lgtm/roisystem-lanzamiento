-- CreateEnum
CREATE TYPE "LaunchStatus" AS ENUM ('planned', 'active', 'closed');

-- CreateEnum
CREATE TYPE "AttendanceMatchType" AS ENUM ('tag', 'form');

-- AlterEnum
ALTER TYPE "SyncEntity" ADD VALUE 'formSubmissions';

-- CreateTable
CREATE TABLE "launches" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "LaunchStatus" NOT NULL DEFAULT 'planned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "launches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "launch_attendance_rules" (
    "id" TEXT NOT NULL,
    "launchId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "matchType" "AttendanceMatchType" NOT NULL,
    "tagName" TEXT,
    "formName" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "launch_attendance_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forms" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "ghlId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_submissions" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "ghlId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "contactGhlId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "launches_locationId_startDate_idx" ON "launches"("locationId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "forms_locationId_ghlId_key" ON "forms"("locationId", "ghlId");

-- CreateIndex
CREATE INDEX "form_submissions_locationId_submittedAt_idx" ON "form_submissions"("locationId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "form_submissions_locationId_ghlId_key" ON "form_submissions"("locationId", "ghlId");

-- AddForeignKey
ALTER TABLE "launches" ADD CONSTRAINT "launches_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "launch_attendance_rules" ADD CONSTRAINT "launch_attendance_rules_launchId_fkey" FOREIGN KEY ("launchId") REFERENCES "launches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_formId_fkey" FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
