-- AlterTable
ALTER TABLE "password_reset_tokens" ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "password_reset_tokens_revokedAt_idx" ON "password_reset_tokens"("revokedAt");
