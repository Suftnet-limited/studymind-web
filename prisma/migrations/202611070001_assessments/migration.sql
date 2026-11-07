CREATE TYPE "AssessmentKind" AS ENUM ('ASSIGNMENT', 'EXAM');
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');
CREATE TABLE "Assessment" (
  "id" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "lecturerId" TEXT NOT NULL,
  "kind" "AssessmentKind" NOT NULL,
  "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AssessmentSubmission" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentSubmission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Assessment_moduleId_status_idx" ON "Assessment"("moduleId", "status");
CREATE UNIQUE INDEX "AssessmentSubmission_assessmentId_studentId_key" ON "AssessmentSubmission"("assessmentId", "studentId");
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentSubmission" ADD CONSTRAINT "AssessmentSubmission_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentSubmission" ADD CONSTRAINT "AssessmentSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
