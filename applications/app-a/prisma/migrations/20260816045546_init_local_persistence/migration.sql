-- CreateEnum
CREATE TYPE "LocalSessionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "profile_cache" (
    "external_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "groups" JSONB,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_cache_pkey" PRIMARY KEY ("external_user_id")
);

-- CreateTable
CREATE TABLE "local_sessions" (
    "id" UUID NOT NULL,
    "session_token_hash" CHAR(64) NOT NULL,
    "external_user_id" UUID NOT NULL,
    "central_session_id" UUID NOT NULL,
    "status" "LocalSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_activity_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,

    CONSTRAINT "local_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "result" VARCHAR(50) NOT NULL,
    "message" TEXT NOT NULL,
    "external_user_id" UUID,
    "local_session_id" UUID,
    "request_id" VARCHAR(100),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "event_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "local_sessions_session_token_hash_key" ON "local_sessions"("session_token_hash");

-- CreateIndex
CREATE INDEX "local_sessions_external_user_id_status_idx" ON "local_sessions"("external_user_id", "status");

-- CreateIndex
CREATE INDEX "local_sessions_central_session_id_status_idx" ON "local_sessions"("central_session_id", "status");

-- CreateIndex
CREATE INDEX "local_sessions_expires_at_idx" ON "local_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "activity_logs_external_user_id_created_at_idx" ON "activity_logs"("external_user_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_logs_local_session_id_created_at_idx" ON "activity_logs"("local_session_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_logs_event_type_created_at_idx" ON "activity_logs"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "processed_events_processed_at_idx" ON "processed_events"("processed_at");

-- AddForeignKey
ALTER TABLE "local_sessions" ADD CONSTRAINT "local_sessions_external_user_id_fkey" FOREIGN KEY ("external_user_id") REFERENCES "profile_cache"("external_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_external_user_id_fkey" FOREIGN KEY ("external_user_id") REFERENCES "profile_cache"("external_user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_local_session_id_fkey" FOREIGN KEY ("local_session_id") REFERENCES "local_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
