-- CreateEnum
CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "EventDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'RETRYING', 'FAILED');

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "user_id" UUID NOT NULL,
    "central_session_id" UUID,
    "application_id" UUID,
    "payload" JSONB NOT NULL,
    "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "publish_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_publish_attempt_at" TIMESTAMP(3),
    "next_publish_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_deliveries" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "status" "EventDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "next_retry_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_status_next_publish_attempt_at_created_at_idx" ON "events"("status", "next_publish_attempt_at", "created_at");

-- CreateIndex
CREATE INDEX "events_user_id_created_at_idx" ON "events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "events_central_session_id_idx" ON "events"("central_session_id");

-- CreateIndex
CREATE INDEX "events_application_id_created_at_idx" ON "events"("application_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_deliveries_event_id_application_id_key" ON "event_deliveries"("event_id", "application_id");

-- CreateIndex
CREATE INDEX "event_deliveries_status_next_retry_at_idx" ON "event_deliveries"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "event_deliveries_application_id_status_idx" ON "event_deliveries"("application_id", "status");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_central_session_id_fkey" FOREIGN KEY ("central_session_id") REFERENCES "sso_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_deliveries" ADD CONSTRAINT "event_deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_deliveries" ADD CONSTRAINT "event_deliveries_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
