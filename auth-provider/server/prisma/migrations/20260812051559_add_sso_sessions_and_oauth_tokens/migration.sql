-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AccessTokenStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PkceCodeChallengeMethod" AS ENUM ('S256');

-- CreateTable
CREATE TABLE "sso_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_token_hash" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_activity_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,

    CONSTRAINT "sso_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorization_codes" (
    "id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "sso_session_id" UUID NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "code_challenge_method" "PkceCodeChallengeMethod" NOT NULL DEFAULT 'S256',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "authorization_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_tokens" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "sso_session_id" UUID NOT NULL,
    "scopes" JSONB,
    "status" "AccessTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sso_sessions_session_token_hash_key" ON "sso_sessions"("session_token_hash");

-- CreateIndex
CREATE INDEX "sso_sessions_user_id_status_idx" ON "sso_sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "sso_sessions_expires_at_idx" ON "sso_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "authorization_codes_code_hash_key" ON "authorization_codes"("code_hash");

-- CreateIndex
CREATE INDEX "authorization_codes_sso_session_id_used_at_idx" ON "authorization_codes"("sso_session_id", "used_at");

-- CreateIndex
CREATE INDEX "authorization_codes_expires_at_idx" ON "authorization_codes"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "access_tokens_token_hash_key" ON "access_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "access_tokens_user_id_status_idx" ON "access_tokens"("user_id", "status");

-- CreateIndex
CREATE INDEX "access_tokens_application_id_status_idx" ON "access_tokens"("application_id", "status");

-- CreateIndex
CREATE INDEX "access_tokens_sso_session_id_status_idx" ON "access_tokens"("sso_session_id", "status");

-- CreateIndex
CREATE INDEX "access_tokens_expires_at_idx" ON "access_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "sso_sessions" ADD CONSTRAINT "sso_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_codes" ADD CONSTRAINT "authorization_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_codes" ADD CONSTRAINT "authorization_codes_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_codes" ADD CONSTRAINT "authorization_codes_sso_session_id_fkey" FOREIGN KEY ("sso_session_id") REFERENCES "sso_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_sso_session_id_fkey" FOREIGN KEY ("sso_session_id") REFERENCES "sso_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
