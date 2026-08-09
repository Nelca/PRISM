/**
 * 永続化スキーマ。
 * 参照元: docs/roadmap/implementation-plan.md §1.1(D-111)、docs/requirements/m8-ledger-versioning.md
 *
 * 設計の要点(承認済み計画のB-1〜B-5):
 *
 * 1. **`packages/core` は一切知らない。**core は副作用を持たない純粋な計算ロジックのまま保つ(D-108)。
 *    core の型 ⇄ 行の変換は `lib/db/serialize.ts` だけが担う
 * 2. **ユーザー操作は追記型のイベント。**現在値は「最新イベント」として導出する。
 *    現在値と変更履歴を別々に持たない(M8 D-5・M6 D-9・M4の変更理由必須と同じ形)
 * 3. **計算結果は run 単位のスナップショット。**`pipeline_run.result` が読み出しの正であり、
 *    個別レコードのテーブルは同一トランザクションで書かれる**派生の索引**である
 *    (両者が食い違う経路を作らないため、必ず同じオブジェクトから同時に書く)
 * 4. 行のキーは `(run_id, record_id)`。`recalculation_hash` は列として持つが同一性には使わない
 *    (T-04 未了のため、現在ハッシュは placeholder。T-04完了時にスキーマ変更なしで実値が入る)
 * 5. 入れ子の構造(quantileRange・transferFitness 等)は jsonb に入れる。列に展開するのは
 *    横断検索に使うキーのみ。core の型が変わるたびにマイグレーションが必要になるのを避ける
 */

import { boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// --- 入力:拠点 ---

/**
 * 取込済みの拠点(SiteRow 相当)+ 深掘り評価用パラメータ。
 * 唯一、更新・削除がありうるテーブル(取込のやり直しを想定するため)。
 */
export const site = pgTable(
  "site",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    siteType: text("site_type").notNull(),
    industrySector: text("industry_sector").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    address: text("address"),
    /** UserSiteDeepDiveParams。拠点ごとの深掘り・意思決定・開示パラメータ。 */
    deepDiveParams: jsonb("deep_dive_params"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] })]
);

// --- 入力:ユーザー操作(追記のみ) ---

/**
 * M2深度トグル・M4代表値変更・M6対策選択/拘束方式・M7開示アクションを、
 * 単一の追記イベントとして記録する。現在値は subject_id ごとの最新行。
 * `app/ledger` の操作ログもこのテーブルの射影(別テーブルを作らない)。
 */
export const interactionEvent = pgTable(
  "interaction_event",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** 操作者。認証を持たないため呼び出し側が渡す(D-111)。 */
    actor: text("actor").notNull(),
    /**
     * depth_override / representative_selection / countermeasure_selection /
     * binding_mechanism_change / disclosure_claim_override / intentional_decision
     */
    kind: text("kind").notNull(),
    /** 操作対象のID(materialIssueId / siteId / claimId 等)。 */
    subjectId: text("subject_id").notNull(),
    payload: jsonb("payload").notNull(),
  },
  (t) => [index("interaction_event_lookup").on(t.tenantId, t.kind, t.subjectId, t.createdAt)]
);

// --- 計算結果:run(追記のみ) ---

export const pipelineRun = pgTable(
  "pipeline_run",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
    /** モンテカルロの乱数シード。この値があれば同じ run を後から再現できる(計画B-3)。 */
    rngSeed: integer("rng_seed").notNull(),
    /** M8 D-2:パイプライン全体のハッシュ。 */
    recalculationHash: text("recalculation_hash").notNull(),
    /** 実行時に採用したパラメータ版(RecalculationHashInputs)。 */
    hashInputs: jsonb("hash_inputs").notNull(),
    /** 読み出しの正。runDemoPipeline() の戻り値そのもの。 */
    result: jsonb("result").notNull(),
    /**
     * `result` の構造の版(RESULT_SCHEMA_VERSION)。
     * ページは保存済みrunをそのまま読むため、結果の構造を変えるコード変更をすると
     * 古い形のrunを新しいコードが読んで壊れる。読み出し時にこの版を突き合わせ、
     * 食い違っていれば再実行する。
     */
    resultSchemaVersion: integer("result_schema_version").notNull().default(1),
  },
  (t) => [index("pipeline_run_latest").on(t.tenantId, t.executedAt)]
);

// --- 計算結果:個別レコードの索引(すべて追記のみ・run単位) ---

export const materialIssue = pgTable(
  "material_issue",
  {
    runId: text("run_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    siteId: text("site_id").notNull(),
    impactCategory: text("impact_category").notNull(),
    sensitivityScore: integer("sensitivity_score").notNull(),
    /** 評価できた基準の数(分母)。5とは限らない(GAP-08 / GAP-13)。 */
    evaluatedCriteriaCount: integer("evaluated_criteria_count").notNull(),
    excluded: boolean("excluded").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.id] }), index("material_issue_site").on(t.tenantId, t.siteId)]
);

export const valuationRecord = pgTable(
  "valuation_record",
  {
    runId: text("run_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    materialIssueId: text("material_issue_id").notNull(),
    siteId: text("site_id").notNull(),
    methodId: text("method_id").notNull(),
    methodVersion: text("method_version").notNull(),
    physicalQuantityId: text("physical_quantity_id").notNull(),
    /** exchange | welfare。合算禁止の規律は型側で担保しているが、横断検索用に列に出す。 */
    valueConcept: text("value_concept").notNull(),
    /** A | B | C | not_applicable。not_applicable を A/C に読み替えない(M3 D-4.2、D-109)。 */
    transferFitnessTier: text("transfer_fitness_tier").notNull(),
    centralValue: doublePrecision("central_value").notNull(),
    recalculationHash: text("recalculation_hash").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.id] }), index("valuation_record_issue").on(t.tenantId, t.materialIssueId)]
);

export const divergenceDecomposition = pgTable(
  "divergence_decomposition",
  {
    runId: text("run_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    siteId: text("site_id").notNull(),
    targetPhysicalQuantityId: text("target_physical_quantity_id").notNull(),
    recalculationHash: text("recalculation_hash").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.id] })]
);

export const decisionRecord = pgTable(
  "decision_record",
  {
    runId: text("run_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    /** DecisionRecord自体は拠点を持たないが、ハーネスは拠点単位で束ねるため索引として保持する。 */
    siteId: text("site_id"),
    decisionTarget: text("decision_target").notNull(),
    /** does_not_cross | crosses | pending。T-12(判定件数カウンタ)がこの列を数える。 */
    verdict: text("verdict").notNull(),
    recalculationHash: text("recalculation_hash").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.id] }), index("decision_record_verdict").on(t.tenantId, t.verdict)]
);

export const gapFinding = pgTable(
  "gap_finding",
  {
    runId: text("run_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    claimId: text("claim_id").notNull(),
    /** null は根拠充足(ギャップなし)。 */
    gapType: text("gap_type"),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.id] })]
);

/** M8 D-1。判断が発生した箇所で自動生成される。編集・削除の経路を作らない(D-5)。 */
export const assumptionEntry = pgTable(
  "assumption_entry",
  {
    runId: text("run_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sourceModule: text("source_module").notNull(),
    relatedRecordId: text("related_record_id").notNull(),
    payload: jsonb("payload").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.id] }), index("assumption_entry_related").on(t.tenantId, t.relatedRecordId)]
);

/**
 * 判定件数のカウンタ(M6 D-8 / design-rationale-log D-30・D-42)。従量課金の唯一の根拠。
 *
 * - verdict が確定(does_not_cross / crosses)した時点で1件。**向きを問わず一律**
 * - `pending` の間はカウントしない(D-45)
 * - **DecisionRecord 1件につき1行。**主キーで重複を防ぐ。runは操作のたびに作り直されるため、
 *   run単位で数えると同じ判定が何度も課金対象になってしまう(§D-117)
 */
export const decisionCountEntry = pgTable(
  "decision_count_entry",
  {
    tenantId: text("tenant_id").notNull(),
    decisionRecordId: text("decision_record_id").notNull(),
    /** 初めて確定したときのrun。後から別のrunで再確定しても更新しない(追記のみ)。 */
    runId: text("run_id").notNull(),
    countedAt: timestamp("counted_at", { withTimezone: true }).notNull().defaultNow(),
    /** does_not_cross | crosses。課金には影響しないが、根拠として残す。 */
    verdict: text("verdict").notNull(),
    siteId: text("site_id"),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.decisionRecordId] })]
);

/** M8 D-3:旧版を削除せず保持し続ける。 */
export const versionedParameterSet = pgTable(
  "versioned_parameter_set",
  {
    tenantId: text("tenant_id").notNull(),
    setId: text("set_id").notNull(),
    version: text("version").notNull(),
    effectiveFrom: text("effective_from").notNull(),
    supersededBy: text("superseded_by"),
    /** 版を更新した場合は必須(M4「変更理由の入力を必須化」と同じ原則)。 */
    changeReason: text("change_reason"),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.setId, t.version] })]
);

/**
 * アプリ用ロールから UPDATE / DELETE を剥奪するテーブル(M8 D-5を権限で担保する)。
 * 手書きマイグレーションがこの一覧を参照する。`site` は取込のやり直しがあるため対象外。
 */
export const APPEND_ONLY_TABLES = [
  "interaction_event",
  "pipeline_run",
  "material_issue",
  "valuation_record",
  "divergence_decomposition",
  "decision_record",
  "gap_finding",
  "assumption_entry",
  "versioned_parameter_set",
  "decision_count_entry",
] as const;
