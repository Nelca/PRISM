ALTER TABLE "decision_count_entry" ADD COLUMN "recalculation_hash" text;--> statement-breakpoint

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
