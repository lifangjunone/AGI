ALTER TABLE "plaza_presence"
ADD COLUMN IF NOT EXISTS "moment_state" jsonb;
