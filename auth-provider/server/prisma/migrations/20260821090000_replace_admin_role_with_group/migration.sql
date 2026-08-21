-- Create the protected Control Panel authorization group before removing roles.
INSERT INTO "groups" (
    "id",
    "name",
    "description",
    "created_at",
    "updated_at"
)
VALUES (
    gen_random_uuid(),
    'control-panel-admins',
    'Users allowed to access the Auth Provider Control Panel',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

-- Preserve access for every administrator created by the previous role-based model.
INSERT INTO "user_groups" (
    "id",
    "user_id",
    "group_id",
    "created_at"
)
SELECT
    gen_random_uuid(),
    "users"."id",
    "groups"."id",
    CURRENT_TIMESTAMP
FROM "users"
CROSS JOIN "groups"
WHERE "users"."role" = 'ADMIN'
  AND "groups"."name" = 'control-panel-admins'
ON CONFLICT ("user_id", "group_id") DO NOTHING;

-- The group membership is now the only source of Control Panel authorization.
ALTER TABLE "users" DROP COLUMN "role";
DROP TYPE "UserRole";
