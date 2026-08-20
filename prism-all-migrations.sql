-- prism: 全マイグレーションを1本にまとめたもの(Neon SQL Editor 貼り付け用)。
-- 自動生成: lib/db/migrations/*.sql を順に連結し、適用記録(schema_migrations)も入れる。
-- これを流したあとは、手元の `npm run db:migrate:remote` も「適用済み」と判定される。

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- ===== 0000_complex_unus.sql =====
CREATE TABLE "assumption_entry" (
	"run_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_module" text NOT NULL,
	"related_record_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "assumption_entry_run_id_id_pk" PRIMARY KEY("run_id","id")
);

CREATE TABLE "decision_record" (
	"run_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"site_id" text,
	"decision_target" text NOT NULL,
	"verdict" text NOT NULL,
	"recalculation_hash" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "decision_record_run_id_id_pk" PRIMARY KEY("run_id","id")
);

CREATE TABLE "divergence_decomposition" (
	"run_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"site_id" text NOT NULL,
	"target_physical_quantity_id" text NOT NULL,
	"recalculation_hash" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "divergence_decomposition_run_id_id_pk" PRIMARY KEY("run_id","id")
);

CREATE TABLE "gap_finding" (
	"run_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"claim_id" text NOT NULL,
	"gap_type" text,
	"data" jsonb NOT NULL,
	CONSTRAINT "gap_finding_run_id_id_pk" PRIMARY KEY("run_id","id")
);

CREATE TABLE "interaction_event" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"payload" jsonb NOT NULL
);

CREATE TABLE "material_issue" (
	"run_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"site_id" text NOT NULL,
	"impact_category" text NOT NULL,
	"sensitivity_score" integer NOT NULL,
	"evaluated_criteria_count" integer NOT NULL,
	"excluded" boolean NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "material_issue_run_id_id_pk" PRIMARY KEY("run_id","id")
);

CREATE TABLE "pipeline_run" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rng_seed" integer NOT NULL,
	"recalculation_hash" text NOT NULL,
	"hash_inputs" jsonb NOT NULL,
	"result" jsonb NOT NULL
);

CREATE TABLE "site" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"site_type" text NOT NULL,
	"industry_sector" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"address" text,
	"deep_dive_params" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);

CREATE TABLE "valuation_record" (
	"run_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"material_issue_id" text NOT NULL,
	"site_id" text NOT NULL,
	"method_id" text NOT NULL,
	"method_version" text NOT NULL,
	"physical_quantity_id" text NOT NULL,
	"value_concept" text NOT NULL,
	"transfer_fitness_tier" text NOT NULL,
	"central_value" double precision NOT NULL,
	"recalculation_hash" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "valuation_record_run_id_id_pk" PRIMARY KEY("run_id","id")
);

CREATE TABLE "versioned_parameter_set" (
	"tenant_id" text NOT NULL,
	"set_id" text NOT NULL,
	"version" text NOT NULL,
	"effective_from" text NOT NULL,
	"superseded_by" text,
	"change_reason" text,
	CONSTRAINT "versioned_parameter_set_tenant_id_set_id_version_pk" PRIMARY KEY("tenant_id","set_id","version")
);

CREATE INDEX "assumption_entry_related" ON "assumption_entry" USING btree ("tenant_id","related_record_id");
CREATE INDEX "decision_record_verdict" ON "decision_record" USING btree ("tenant_id","verdict");
CREATE INDEX "interaction_event_lookup" ON "interaction_event" USING btree ("tenant_id","kind","subject_id","created_at");
CREATE INDEX "material_issue_site" ON "material_issue" USING btree ("tenant_id","site_id");
CREATE INDEX "pipeline_run_latest" ON "pipeline_run" USING btree ("tenant_id","executed_at");
CREATE INDEX "valuation_record_issue" ON "valuation_record" USING btree ("tenant_id","material_issue_id");
INSERT INTO schema_migrations (filename) VALUES ('0000_complex_unus.sql') ON CONFLICT DO NOTHING;

-- ===== 0001_append_only_role.sql =====
-- 手書きマイグレーション(drizzle-kitの生成物ではない)。
--
-- M8 D-5「既存のAssumptionEntryを編集・削除する経路は用意しない」を、
-- アプリケーションコードの注意ではなく **DBの権限** で担保する。
-- アプリは prism_app ロールで接続し、台帳・run系テーブルに対して INSERT と SELECT しか持たない。
--
-- 対象テーブルの一覧は lib/db/schema.ts の APPEND_ONLY_TABLES と一致させること。
-- テーブルを追加したら、この一覧にも追加する(append-only.db.test.ts が突き合わせて検証する)。
--
-- マネージドPostgres(Neon等)ではDB名が prism ではなく、ロール作成が許可されないこともある。
-- そのため (a) DB名は current_database() から取る (b) ロールを作れない環境では権限付与を
-- まるごと諦める(その環境ではアプリがオーナーロールで接続するため、append-onlyの担保は
-- アプリケーションコード側の追記専用の書き方だけになる)。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prism_app') THEN
    BEGIN
      CREATE ROLE prism_app LOGIN PASSWORD 'prism_local_dev';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'prism_app ロールを作成できないため権限設定をスキップします';
      RETURN;
    END;
  END IF;

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO prism_app', current_database());
  GRANT USAGE ON SCHEMA public TO prism_app;

  -- site だけは取込のやり直しがあるため、更新・削除を許可する。
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "site" TO prism_app;

  -- 以下は追記のみ。UPDATE・DELETE を与えない。
  GRANT SELECT, INSERT ON TABLE "interaction_event" TO prism_app;
  GRANT SELECT, INSERT ON TABLE "pipeline_run" TO prism_app;
  GRANT SELECT, INSERT ON TABLE "material_issue" TO prism_app;
  GRANT SELECT, INSERT ON TABLE "valuation_record" TO prism_app;
  GRANT SELECT, INSERT ON TABLE "divergence_decomposition" TO prism_app;
  GRANT SELECT, INSERT ON TABLE "decision_record" TO prism_app;
  GRANT SELECT, INSERT ON TABLE "gap_finding" TO prism_app;
  GRANT SELECT, INSERT ON TABLE "assumption_entry" TO prism_app;
  GRANT SELECT, INSERT ON TABLE "versioned_parameter_set" TO prism_app;

  -- 明示的に剥奪する。将来 PUBLIC や継承経由で権限が付いた場合にも効くようにするため、
  -- GRANT を絞るだけでなく REVOKE も書く。
  REVOKE UPDATE, DELETE, TRUNCATE ON TABLE
    "interaction_event", "pipeline_run", "material_issue", "valuation_record",
    "divergence_decomposition", "decision_record", "gap_finding",
    "assumption_entry", "versioned_parameter_set"
  FROM prism_app;
END
$$;
INSERT INTO schema_migrations (filename) VALUES ('0001_append_only_role.sql') ON CONFLICT DO NOTHING;

-- ===== 0002_result_schema_version.sql =====
ALTER TABLE "pipeline_run" ADD COLUMN "result_schema_version" integer DEFAULT 1 NOT NULL;
INSERT INTO schema_migrations (filename) VALUES ('0002_result_schema_version.sql') ON CONFLICT DO NOTHING;

-- ===== 0003_decision_count_entry.sql =====
CREATE TABLE "decision_count_entry" (
	"tenant_id" text NOT NULL,
	"decision_record_id" text NOT NULL,
	"run_id" text NOT NULL,
	"counted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verdict" text NOT NULL,
	"site_id" text,
	CONSTRAINT "decision_count_entry_tenant_id_decision_record_id_pk" PRIMARY KEY("tenant_id","decision_record_id")
);


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
INSERT INTO schema_migrations (filename) VALUES ('0003_decision_count_entry.sql') ON CONFLICT DO NOTHING;

-- ===== 0004_backfill_decision_counts.sql =====
-- 手書きマイグレーション。
--
-- 判定件数のカウンタ(0003)を追加する前に確定していた判定を、既存の decision_record から補填する。
-- カウンタの導入以降に作られた run しか数えないと、**導入前に確定していた判定が課金対象から
-- 漏れる**(逆に、後から数え直して二重に積むこともあってはならない)。
--
-- decision_record は run 単位のスナップショット(派生索引)なので、同じ DecisionRecord が
-- 複数 run に存在する。**最初に確定した run を採用する**(DISTINCT ON + executed_at 昇順)。
-- 既に計上済みのものは ON CONFLICT DO NOTHING で触らない。

INSERT INTO decision_count_entry (tenant_id, decision_record_id, run_id, counted_at, verdict, site_id)
SELECT DISTINCT ON (d.tenant_id, d.id)
  d.tenant_id,
  d.id,
  d.run_id,
  r.executed_at,
  d.verdict,
  d.site_id
FROM decision_record d
JOIN pipeline_run r ON r.id = d.run_id
WHERE d.verdict <> 'pending'
ORDER BY d.tenant_id, d.id, r.executed_at ASC
ON CONFLICT (tenant_id, decision_record_id) DO NOTHING;
INSERT INTO schema_migrations (filename) VALUES ('0004_backfill_decision_counts.sql') ON CONFLICT DO NOTHING;

-- ===== 0005_decision_count_hash.sql =====
ALTER TABLE "decision_count_entry" ADD COLUMN "recalculation_hash" text;

-- 既に計上済みの判定には、当時の再計算ハッシュを補填する。
-- decision_record(派生索引)に、そのrun時点のハッシュが残っている。
-- 初めて確定したrunの値を採用する(判定件数の計上に使ったrunと同じ行)。
UPDATE decision_count_entry c
SET recalculation_hash = d.recalculation_hash
FROM decision_record d
WHERE d.tenant_id = c.tenant_id
  AND d.id = c.decision_record_id
  AND d.run_id = c.run_id
  AND c.recalculation_hash IS NULL;
INSERT INTO schema_migrations (filename) VALUES ('0005_decision_count_hash.sql') ON CONFLICT DO NOTHING;
