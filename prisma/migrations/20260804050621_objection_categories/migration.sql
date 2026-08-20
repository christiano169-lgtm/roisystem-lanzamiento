-- CreateEnum
CREATE TYPE "ObjectionCategory" AS ENUM ('precio', 'tiempo', 'competencia', 'confianza', 'necesidad', 'otro');

-- AlterTable
ALTER TABLE "quality_analyses" ADD COLUMN     "objectionCategories" "ObjectionCategory"[] DEFAULT ARRAY[]::"ObjectionCategory"[];
