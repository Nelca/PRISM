CREATE TABLE "decision_count_entry" (
	"tenant_id" text NOT NULL,
	"decision_record_id" text NOT NULL,
	"run_id" text NOT NULL,
	"counted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verdict" text NOT NULL,
	"site_id" text,
	CONSTRAINT "decision_count_entry_tenant_id_decision_record_id_pk" PRIMARY KEY("tenant_id","decision_record_id")
);
--> statement-breakpoint

-- 追記のみ(M8 D-5と同じ扱い)。判定件数は課金の根拠であり、後から書き換えられてはならない。
-- 一覧は lib/db/schema.ts の APPEND_ONLY_TABLES と一致させること。
-- prism_app が存在しない環境(マネージドPostgresでロールを作れない場合)では権限設定を飛ばす。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prism_app') THEN
    RETURN;
  END IF;
  GRANT SELECT, INSERT ON TABLE "decision_count_entry" TO prism_app;
  REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "decision_count_entry" FROM prism_app;
END
$$;
