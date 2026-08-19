-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_id" UUID,
    "user_id" UUID,
    "application_id" UUID,
    "session_id" UUID,
    "result" TEXT NOT NULL,
    "metadata" JSONB,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_event_type_created_at_idx" ON "audit_logs"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_application_id_created_at_idx" ON "audit_logs"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_session_id_idx" ON "audit_logs"("session_id");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sso_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
