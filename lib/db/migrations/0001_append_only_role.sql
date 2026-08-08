-- 手書きマイグレーション(drizzle-kitの生成物ではない)。
--
-- M8 D-5「既存のAssumptionEntryを編集・削除する経路は用意しない」を、
-- アプリケーションコードの注意ではなく **DBの権限** で担保する。
-- アプリは prism_app ロールで接続し、台帳・run系テーブルに対して INSERT と SELECT しか持たない。
--
-- 対象テーブルの一覧は lib/db/schema.ts の APPEND_ONLY_TABLES と一致させること。
-- テーブルを追加したら、この一覧にも追加する(append-only.db.test.ts が突き合わせて検証する)。

-- アプリ接続用ロール。既に存在する場合は作り直さない(再実行可能にする)。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prism_app') THEN
    CREATE ROLE prism_app LOGIN PASSWORD 'prism_local_dev';
  END IF;
END
$$;
--> statement-breakpoint

GRANT CONNECT ON DATABASE prism TO prism_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO prism_app;
--> statement-breakpoint

-- site だけは取込のやり直しがあるため、更新・削除を許可する。
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "site" TO prism_app;
--> statement-breakpoint

-- 以下は追記のみ。UPDATE・DELETE を与えない。
GRANT SELECT, INSERT ON TABLE "interaction_event" TO prism_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "pipeline_run" TO prism_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "material_issue" TO prism_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "valuation_record" TO prism_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "divergence_decomposition" TO prism_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "decision_record" TO prism_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "gap_finding" TO prism_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "assumption_entry" TO prism_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "versioned_parameter_set" TO prism_app;
--> statement-breakpoint

-- 明示的に剥奪する。将来 PUBLIC や継承経由で権限が付いた場合にも効くようにするため、
-- GRANT を絞るだけでなく REVOKE も書く。
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE
  "interaction_event", "pipeline_run", "material_issue", "valuation_record",
  "divergence_decomposition", "decision_record", "gap_finding",
  "assumption_entry", "versioned_parameter_set"
FROM prism_app;
