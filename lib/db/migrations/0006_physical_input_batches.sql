CREATE TABLE "input_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"category" text NOT NULL,
	"source_kind" text NOT NULL,
	"schema_version" text NOT NULL,
	"data_version" text NOT NULL,
	"reporting_year" integer,
	"source_manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "physical_input_record" (
	"batch_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"site_id" text NOT NULL,
	"category" text NOT NULL,
	"physical_quantity" double precision,
	"unit" text NOT NULL,
	"calculation_eligibility" text NOT NULL,
	"source_record_hash" text NOT NULL,
	"source_line_number" integer NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "physical_input_record_batch_id_id_pk" PRIMARY KEY("batch_id","id")
);
--> statement-breakpoint
CREATE TABLE "calculation_line_item" (
	"run_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"input_record_id" text NOT NULL,
	"material_issue_id" text,
	"method_id" text NOT NULL,
	"status" text NOT NULL,
	"factor_id" text,
	"mapping_id" text,
	"valuation_record_id" text,
	"amount" double precision,
	"reason" text,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calculation_line_item_run_id_id_pk" PRIMARY KEY("run_id","id")
);
--> statement-breakpoint
CREATE INDEX "input_batch_tenant_category" ON "input_batch" USING btree ("tenant_id","category","created_at");
--> statement-breakpoint
CREATE INDEX "physical_input_record_batch" ON "physical_input_record" USING btree ("tenant_id","batch_id");
--> statement-breakpoint
CREATE INDEX "physical_input_record_site_category" ON "physical_input_record" USING btree ("tenant_id","site_id","category");
--> statement-breakpoint
CREATE INDEX "calculation_line_item_input" ON "calculation_line_item" USING btree ("tenant_id","input_record_id");
--> statement-breakpoint
CREATE INDEX "calculation_line_item_issue" ON "calculation_line_item" USING btree ("tenant_id","material_issue_id");
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prism_app') THEN
    GRANT SELECT, INSERT ON TABLE "input_batch", "physical_input_record", "calculation_line_item" TO prism_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "input_batch", "physical_input_record", "calculation_line_item" FROM prism_app;
  END IF;
END
$$;
