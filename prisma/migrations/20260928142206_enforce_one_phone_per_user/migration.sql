/*
  Warnings:

  - You are about to drop the column `isPrimary` on the `phone_numbers` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId]` on the table `phone_numbers` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "phone_numbers_userId_idx";

-- DropIndex
DROP INDEX "phone_numbers_verifiedAt_idx";

-- AlterTable
ALTER TABLE "phone_numbers" DROP COLUMN "isPrimary";

-- CreateIndex
CREATE UNIQUE INDEX "phone_numbers_userId_key" ON "phone_numbers"("userId");
