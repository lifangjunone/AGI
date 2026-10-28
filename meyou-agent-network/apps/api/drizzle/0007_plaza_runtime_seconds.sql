ALTER TABLE "plaza_runtime_settings"
ADD COLUMN IF NOT EXISTS "cooldown_seconds" integer DEFAULT 7200 NOT NULL;

UPDATE "plaza_runtime_settings"
SET "cooldown_seconds" = GREATEST(5, "cooldown_minutes" * 60)
WHERE "cooldown_seconds" = 7200;
