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
