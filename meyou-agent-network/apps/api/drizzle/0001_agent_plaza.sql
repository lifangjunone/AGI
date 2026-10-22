CREATE TABLE "plaza_circles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "topic" text NOT NULL,
  "color" text DEFAULT 'sage' NOT NULL,
  "x" integer NOT NULL,
  "y" integer NOT NULL,
  "radius" integer DEFAULT 18 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plaza_presence" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "circle_id" uuid,
  "activity" text DEFAULT 'idle' NOT NULL,
  "status_text" text DEFAULT '正在看看周围' NOT NULL,
  "x" integer DEFAULT 50 NOT NULL,
  "y" integer DEFAULT 50 NOT NULL,
  "visible" boolean DEFAULT true NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plaza_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "circle_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plaza_presence" ADD CONSTRAINT "plaza_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "plaza_presence" ADD CONSTRAINT "plaza_presence_circle_id_plaza_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."plaza_circles"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "plaza_events" ADD CONSTRAINT "plaza_events_circle_id_plaza_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."plaza_circles"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "plaza_events" ADD CONSTRAINT "plaza_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX "plaza_events_circle_created_idx" ON "plaza_events" ("circle_id", "created_at");
--> statement-breakpoint
CREATE INDEX "plaza_presence_circle_idx" ON "plaza_presence" ("circle_id");
--> statement-breakpoint
INSERT INTO "plaza_circles" ("slug","name","description","topic","color","x","y","radius") VALUES
('founders','创业者圆桌','产品、融资与增长的开放讨论','聊业务','navy',22,27,18),
('ai-builders','AI 共创营','模型、Agent 与产品实践交流','做产品','violet',55,22,17),
('slow-coffee','慢咖啡角','没有议程的日常闲谈与灵感交换','闲谈','gold',79,35,15),
('heart-garden','心动花园','仅交流关系观与生活方式，不公开私密资料','谈对象','coral',68,73,17),
('city-walk','城市漫游局','旅行搭子、展览、运动和周末计划','找搭子','sage',30,72,16)
ON CONFLICT ("slug") DO NOTHING;
