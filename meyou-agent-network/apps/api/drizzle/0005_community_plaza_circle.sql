ALTER TABLE "plaza_circles" ADD COLUMN IF NOT EXISTS "community_id" uuid;
ALTER TABLE "plaza_circles" ADD COLUMN IF NOT EXISTS "owner_id" uuid;
ALTER TABLE "plaza_circles" ADD COLUMN IF NOT EXISTS "visibility" text DEFAULT 'public' NOT NULL;
DO $$ BEGIN
  ALTER TABLE "plaza_circles" ADD CONSTRAINT "plaza_circles_community_id_communities_id_fk"
    FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "plaza_circles" ADD CONSTRAINT "plaza_circles_owner_id_users_id_fk"
    FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "plaza_circles_community_idx" ON "plaza_circles" ("community_id");
