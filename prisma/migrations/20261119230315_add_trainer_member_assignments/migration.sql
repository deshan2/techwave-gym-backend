-- CreateTable
CREATE TABLE "TrainerMemberAssignment" (
    "id" UUID NOT NULL,
    "trainerId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerMemberAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainerMemberAssignment_trainerId_isActive_idx" ON "TrainerMemberAssignment"("trainerId", "isActive");

-- CreateIndex
CREATE INDEX "TrainerMemberAssignment_memberId_isActive_idx" ON "TrainerMemberAssignment"("memberId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerMemberAssignment_trainerId_memberId_key" ON "TrainerMemberAssignment"("trainerId", "memberId");

-- AddForeignKey
ALTER TABLE "TrainerMemberAssignment" ADD CONSTRAINT "TrainerMemberAssignment_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerMemberAssignment" ADD CONSTRAINT "TrainerMemberAssignment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
