-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('CONFIRMED', 'DRAFT', 'FAILED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('project.task');

-- CreateTable
CREATE TABLE "action_sessions" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "status" "ActionStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL DEFAULT 'project.task',
    "entity_id" INTEGER NOT NULL,
    "action_type" TEXT NOT NULL,
    "before_state" JSONB NOT NULL,
    "after_state" JSONB NOT NULL,
    "applied_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "action_sessions_created_at_idx" ON "action_sessions"("created_at");

-- CreateIndex
CREATE INDEX "action_sessions_status_idx" ON "action_sessions"("status");

-- CreateIndex
CREATE INDEX "actions_session_id_idx" ON "actions"("session_id");

-- CreateIndex
CREATE INDEX "actions_entity_id_action_type_idx" ON "actions"("entity_id", "action_type");

-- CreateIndex
CREATE INDEX "actions_status_idx" ON "actions"("status");

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "action_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
