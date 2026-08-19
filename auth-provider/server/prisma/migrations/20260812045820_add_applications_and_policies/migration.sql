-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PolicyEffect" AS ENUM ('ALLOW');

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret_hash" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "launch_url" TEXT,
    "logout_notification_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_redirect_uris" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_redirect_uris_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_group_policies" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "effect" "PolicyEffect" NOT NULL DEFAULT 'ALLOW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_group_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "applications_client_id_key" ON "applications"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_redirect_uris_application_id_redirect_uri_key" ON "application_redirect_uris"("application_id", "redirect_uri");

-- CreateIndex
CREATE INDEX "application_group_policies_group_id_idx" ON "application_group_policies"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_group_policies_application_id_group_id_effect_key" ON "application_group_policies"("application_id", "group_id", "effect");

-- AddForeignKey
ALTER TABLE "application_redirect_uris" ADD CONSTRAINT "application_redirect_uris_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_group_policies" ADD CONSTRAINT "application_group_policies_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_group_policies" ADD CONSTRAINT "application_group_policies_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
