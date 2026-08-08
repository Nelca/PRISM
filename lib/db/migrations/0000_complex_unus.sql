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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "gap_finding" (
	"run_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"claim_id" text NOT NULL,
	"gap_type" text,
	"data" jsonb NOT NULL,
	CONSTRAINT "gap_finding_run_id_id_pk" PRIMARY KEY("run_id","id")
);
--> statement-breakpoint
CREATE TABLE "interaction_event" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "pipeline_run" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rng_seed" integer NOT NULL,
	"recalculation_hash" text NOT NULL,
	"hash_inputs" jsonb NOT NULL,
	"result" jsonb NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "versioned_parameter_set" (
	"tenant_id" text NOT NULL,
	"set_id" text NOT NULL,
	"version" text NOT NULL,
	"effective_from" text NOT NULL,
	"superseded_by" text,
	"change_reason" text,
	CONSTRAINT "versioned_parameter_set_tenant_id_set_id_version_pk" PRIMARY KEY("tenant_id","set_id","version")
);
--> statement-breakpoint
CREATE INDEX "assumption_entry_related" ON "assumption_entry" USING btree ("tenant_id","related_record_id");--> statement-breakpoint
CREATE INDEX "decision_record_verdict" ON "decision_record" USING btree ("tenant_id","verdict");--> statement-breakpoint
CREATE INDEX "interaction_event_lookup" ON "interaction_event" USING btree ("tenant_id","kind","subject_id","created_at");--> statement-breakpoint
CREATE INDEX "material_issue_site" ON "material_issue" USING btree ("tenant_id","site_id");--> statement-breakpoint
CREATE INDEX "pipeline_run_latest" ON "pipeline_run" USING btree ("tenant_id","executed_at");--> statement-breakpoint
CREATE INDEX "valuation_record_issue" ON "valuation_record" USING btree ("tenant_id","material_issue_id");