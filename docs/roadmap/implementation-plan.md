# GAP解消 実装計画(再開可能な作業台帳)

**目的:** `docs/requirements/mvp-completion-gap.md` のGAP-01〜21のうち、**外部データ・契約・顧客提供データを待たずに着手できるもの**から実装する。作業が中断しても、本書だけを読めば再開できる状態を保つ。
**参照元:** `docs/requirements/mvp-completion-gap.md`、`docs/data/acquisition-runbook.md` §1.8(実装ブロックの判定)
**最終更新:** 2026-08-08

---

## 0. 再開手順(中断後にここから読む)

1. **本書 §2 の進捗表を見る。**`状態` が `作業中` の行があれば、その行の「再開の手がかり」から続ける
2. `npm test`(vitest)・`npm run typecheck`・`npm run lint` を流し、緑であることを確認してから次に進む
3. 1タスク完了ごとに、本書 §2 の状態を更新し、**その場でコミットする**(PR descriptionに対応する要件定義/ADRのパスを書く。`docs/README.md` 運用ルール)
4. 設計判断が発生したら `docs/decisions/design-rationale-log.md` に追記する。**根拠を書かずにコミットしない**

**守るべき既存規律(実装中に破りやすいもの):**

- 推定で埋めない(D-15)。データが無い箇所は `null` / `pending` / `unmapped` を返す
- 価値概念(交換価値/厚生価値)を同じ配列・同じ合計に入れない
- 判断が発生した箇所で AssumptionEntry を生成する
- フォールバック適用・非GAAP・ティア・除外事項のラベルを出力から落とさない
- 除外事項X1〜X7(`build-plan` §10)に触れる実装をしない

---

## 1. 方針の確定

### 1.1 永続化(E-2)の決定 —— D-108との整合込み

**Docker Compose + PostgreSQL + Drizzle ORM を、`packages/core` の外側に置く。テナント分離は最小限にとどめる。**(2026-08-08、ユーザー判断)

**D-108(2026-08-03)との関係が最重要:** D-108は「認証・認可・テナント分離は `packages/core` に持ち込まず、将来coreをnpm package化して既存Next.jsサービス側でラップする」「`app/`・`lib/demo/` は本番プロダクトUIではなく開発ハーネス」と定めている。したがって:

| 論点 | 決定 | 理由 |
|---|---|---|
| `packages/core` | **一切変更しない。**DBアクセス・`tenantId`・セッションの概念を入れない | D-108。coreは副作用を持たない純粋な計算ロジックのまま保つ |
| 永続化層の置き場 | `lib/db/`(coreの外側) | coreをnpm package化して切り出すとき、永続化層は付いてこない構成にする |
| DB | PostgreSQL(Docker Compose) | 追記のみを権限で強制でき、将来のマルチテナントにも耐える。ローカルと将来のデプロイで同じ構成 |
| ORM | Drizzle | **マイグレーションが素のSQLとして残る。**追記のみ(M8 D-5)を `REVOKE UPDATE, DELETE` で強制するため、SQLを直接書ける方が監査説明しやすい |
| テナント | `tenantId` 列は持つが、**認証・認可はこのrepoで作り込まない** | 本番のマルチテナント認可は組み込み先サービスの責務(D-108)。ここで作ると二重になる |
| GAP-15(テナント分離) | **縮小。**列とスコープ付きクエリまで。RLSポリシー・ログイン機能は作らない | 同上 |
| GAP-16(出力APIの無認証) | **解消する。**最小限のAPIキー確認を入れる | ハーネスであっても、実データが入った瞬間に無認証の全社データ漏洩経路になるため |

**追記のみの強制方法:** AssumptionEntry・VersionedParameterSet・BindingMechanismChangeEntry の各テーブルに対し、アプリケーション用ロールから `UPDATE` / `DELETE` 権限を剥奪する。コード側で「更新しない」と気をつけるのではなく、**DBが物理的に拒否する**構成にする(M8 D-5「編集・削除する経路を用意しない」を型ではなく権限で担保する)。

### 1.2 作業の順序

外部依存のない順。§2の `波` 列に対応。

```
波A(データ・契約・DB のいずれも待たない。純粋なコード修正)
  T-01 GAP-17  ティア読み替えの削除
  T-02 GAP-08  ライセンスゲーティングの配線
  T-03 GAP-13  評価不能基準の可視化(T-02と同じ機構)
  T-04 GAP-06  レコード単位の再計算ハッシュ
  T-05 GAP-09  代表値選択 + 前年度手法での再計算値
  T-06 GAP-10  M5パイプライン + 比較先の算出と表示
  T-07 GAP-18  固定文言のレッドフラグを実データ由来にする

波B(DB基盤。§1.1の決定に基づく)
  T-08 Docker Compose + Postgres + Drizzle の足場
  T-09 スキーマ定義とマイグレーション(追記のみの権限設定込み)
  T-10 テナント分離(GAP-15)と出力APIの認証(GAP-16)
  T-11 デモ層のプロセス内ストアからDBへの移行(GAP-01)

波C(DB完成後)
  T-12 GAP-12  判定件数カウンタ
  T-13 GAP-07  版レジストリ画面と旧版係数での再計算
  T-14 GAP-02  取込UI(lib/intake の配線)+ 取込エラー表示
  T-15 GAP-03  財務パラメータ入力UI(pending状態を実際に通す)

波D(外部依存が解けてから。本計画のスコープ外)
  GAP-04(ライセンス契約待ち)、GAP-05(AI提供者の決定待ち)、GAP-11(NGFS/GX-ETS待ち)、GAP-14(E-1の判断待ち)
```

---

## 2. 進捗表

| # | GAP | 内容 | 波 | 状態 | 再開の手がかり |
|---|---|---|---|---|---|
| T-01 | 17 | `not_applicable` ティアを "A" に読み替えている箇所の削除 | A | **完了** | — |
| T-02 | 08 | ライセンスゲーティングをM1〜M2パイプラインに配線 | A | **完了**(D-110) | — |
| T-03 | 13 | 評価不能基準(ライセンス保留・データ源なし)の可視化 | A | **完了**(D-110) | — |
| T-04 | 06 | レコード単位の再計算ハッシュ(placeholder の解消) | A | **完了**(D-113) | — |
| T-05 | 09 | 代表値選択と前年度手法での再計算値の並記 | A | **完了**(D-114) | — |
| T-06 | 10 | M5パイプライン + 比較先(営業利益比・減損・格付)の算出と表示 | A | **完了**(D-115) | — |
| T-07 | 18 | 財務画面のレッドフラグ固定文言をデータ由来にする | A | **完了**(D-115) | — |
| T-08 | 01 | Docker Compose + Postgres + Drizzle の足場 | B | **完了**(D-112) | — |
| T-09 | 01 | スキーマ・マイグレーション(追記のみを権限で強制) | B | **完了**(D-112) | — |
| T-10 | 15/16 | テナント分離・出力APIの認証 | B | **完了**(D-112) | — |
| T-11 | 01 | `lib/demo/*-store.ts` からDBへの移行、`Math.random` 差し替え(D-103)の廃止 | B | **完了**(D-112) | — |
| T-12 | 12 | 判定件数カウンタ(追記型) | C | **完了**(D-117) | — |
| T-13 | 07 | 版レジストリ画面と旧版係数での再計算 | C | 未着手 | `versioned-parameter-set.ts` は実装済み。UIがない |
| T-14 | 02 | 取込UI + 取込エラー表示 | C | 未着手 | `lib/intake/` は完成済みで `app/` から未参照 |
| T-15 | 03 | 財務パラメータ入力UI | C | 未着手 | `docs/data/acquisition-runbook.md` §3.11(受け入れガイドの拡張)と対で進める |

**状態の凡例:** 未着手 / 作業中 / 完了 / 保留(理由を書く)

---

## 3. タスク詳細

### T-01 GAP-17 ティア読み替えの削除 【完了】

**問題:** `app/valuation/page.tsx` と `app/decomposition/page.tsx` が `transferFitness.tier === "not_applicable" ? "A" : tier` として、**M3 D-4.2が明示的に禁じた読み替え**を行っていた。

**対応:** フットボールチャートを `not_applicable` を第4の状態として表示できるようにし、読み替えを削除した。

**完了条件:** `grep -rn 'not_applicable" ? "A"' app` が何も返さない。

---

### T-02/T-03 GAP-08・GAP-13 【完了。詳細は design-rationale-log D-110】

**実装したもの:** `site/criteria.ts` の `assessCriteria()` が、5基準の判定と同時に「評価できなかった基準とその理由」を返す。`MaterialIssue.unevaluatedCriteria` として保持し、AssumptionEntry(`kind: "criterion_unevaluated"`、新設)に1件ずつ記録する。画面は感応度を「2/4」のように**評価できた基準数を分母**にして表示する。

**副作用(意図的):** デモデータの site-042 は KBA が `pending_review` のため、感応度スコアが3→2に下がる。これが仕様どおりの挙動。契約締結後に `licenseMode` を変えれば3に戻ることをテストで固定した。

**以下は当初の作業メモ(履歴として残す):**

### T-02 GAP-08 ライセンスゲーティングの配線

**問題:** `licenseMode: "pending_review"` のデータソース(契約前のWDPA/IBAT)に依存する基準が、そのまま感応度スコアに算入されている。M8 D-4は「充足数のカウントに含めない」と定めており、**現状は仕様と逆の挙動。**

**やること:**
1. `evaluateCriteriaMet()` の呼び出し経路に、`NatureInterface.licenseMode` を見て `pending_review` のレイヤを充足判定から除外する処理を通す
2. 除外した基準を捨てず、**「保留中の基準」として `MaterialIssue` に保持する**(T-03が使う)
3. 保留が発生した箇所で AssumptionEntry を生成する(ライセンス確認待ちで暫定スコアだった、という監査証跡)
4. 既存の `ledger/license-gated-sensitivity.ts` を再実装しない。再利用する

**注意:** `NatureInterface` は既に `licenseMode` を持っている。**新しいフィールドを型に足す前に、既存フィールドで足りないかを必ず確認する。**

**完了条件:** `pending_review` のレイヤが `true` を返しても感応度スコアが増えない。テストで確認。

---

### T-03 GAP-13 評価不能基準の可視化

**問題:** `rapidIntegrityDecline` はデータ源がなく恒久的に false(D-91)。`sensitivityScore` の実質上限が4であることが、レコードにも画面にも現れていない。

**やること:**
1. `MaterialIssue` に「評価した基準の数 / 評価不能な基準とその理由」を保持する(T-02の保留基準と同じ器)。理由は2種:`license_pending`(契約待ち)と `no_data_source`(データ源なし)
2. 拠点一覧・評価画面に「5基準中N基準で評価しています」と、その内訳を表示する

**推定で埋めない:** 評価不能な基準を「false」と「評価していない」で区別する。**スコアの分母を暗黙に5のままにしない。**

**完了条件:** スコアの分母が何基準だったかがレコードと画面の両方から判別できる。

---

### T-04 GAP-06 【完了。詳細は design-rationale-log D-113】

**実装したもの:** `ledger/recalculation-hash.ts` に `computeRecordHash()` を追加し(パイプライン全体のハッシュと同じ関数を使う)、`ValuationRecord`・`DivergenceDecomposition`・`DecisionRecord` の3つで placeholder を解消した。版情報は各ビルダーの必須引数(`versions`)にしたため、渡し忘れるとコンパイルが通らない。

**ハッシュに入れたもの / 入れなかったもの:**
- 入れた:レコードの同一性(methodId・physicalQuantityId・siteId等)、パラメータ版、**較正パラメータの実値**(版が同じまま値が差し替わった場合を検出するため)、**上流レコードのハッシュ**(ValuationRecord → DivergenceDecomposition / DecisionRecord へ伝播する)
- 入れなかった:**モンテカルロの乱数シード。**シードは分位点にしか影響せず、M8 D-2がハッシュを「パラメータ版」と定義しているため。シードは `pipeline_run.rng_seed` に別途保存済み

**以下は当初の作業メモ(履歴として残す):**

### T-04 GAP-06 レコード単位の再計算ハッシュ

**問題:** `ValuationRecord` / `DivergenceDecomposition` / `DecisionRecord` の `recalculationHash` が全て `placeholder:...`。

**やること:**
1. 各 `build*` 関数に、そのレコードの計算に実際に入った版情報を渡す。**Optionalにしない**(渡さないとコンパイルが通らない形にする)
2. `ledger/recalculation-hash.ts` と同じハッシュ関数を使う。モジュールごとに別の実装を作らない
3. パイプライン層(`pipeline/*.ts`)から版情報を流す

**完了条件:** 任意のレコード1件のハッシュから、生成に使われた全パラメータ版が特定でき、同じ入力で再実行すると同じハッシュになる(テスト)。

---

### T-05 GAP-09 【完了。詳細は design-rationale-log D-114】

**実装したもの:** `divergence/representative-value.ts`(選択の組み立て・前年度手法での再計算値の解決・選択材料となる事実の列挙)。パイプラインが選択を受け取り、`DivergenceDecomposition.representativeValueSelection` を埋めて AssumptionEntry を生成する。`/decomposition` に「前年度手法との比較」カードを追加した。

**要点:**
- **前年度手法での再計算値は、当年度の物理量で前年度手法を計算した値。**M3は毎回全手法を並行実行しているため、当年度のレコードから引くだけで得られる(新たな再計算は発生しない)
- **「実態変化による差分」は算出しない。**過年度の実績値を保持していないため。持っていない値を推定で埋めない(D-15)
- 前年度手法が手法セットから消えている場合は `method_unavailable` として理由を返す
- **利用者が実際に選んだときだけ記録する。**既定値を使っている状態を「選択した」と記録しない(選択には理由が必須で、理由をシステムが捏造しないため)

**以下は当初の作業メモ(履歴として残す):**

### T-05 GAP-09 代表値選択と前年度手法での再計算値

**問題:** 構想書9.3の必須要件「手法変更時は前年度手法での再計算値を並記」が未実装。`recalculatedWithPriorMethod` はリポジトリ全体で参照ゼロ。**build-plan §10「実装で起きやすい違反」の4項目目に該当している。**

**やること:**
1. `representativeValueSelection` をcore側で組み立てる関数を作る
2. 前年度手法での再計算:前年度に選択された手法プラグイン × 当年度の物理量で `buildValuationRecords()` を再実行し、当年度の代表値と並記する
3. 変更理由の入力を必須にする(デフォルト値なし。M6 D-9と同じ規律)
4. AssumptionEntry `kind: "representative_value_selection"` を生成する(payload導出は M8 に実装済み)

**システムは推奨しない(D-23):** 事実(前年度手法・基準が言及する手法・ティア分布)を提示するだけ。推奨ロジックを足さない。

**完了条件:** 手法変更の差分と実態変化の差分が分離されて並記され、変更理由が台帳に残る。

---

### T-06/T-07 GAP-10・GAP-18 【完了。詳細は design-rationale-log D-115】

**実装したもの:** `pipeline/financial-bridge-pipeline.ts` を新設し、デモ層が各M5関数を直接呼んでいた構成を置き換えた。`computeComparisonTargets()` は変化後の比率を自分で算出する。財務画面に比較先(営業利益比・減損テストへの影響・信用指標の変化)を表示し、レッドフラグを実データ由来にした。

**要点:**
- **変化後の比率はPRISMが算出する。**レバレッジは自然債務を有利子負債に上乗せ、インタレストカバレッジはブリッジ1の自然調整後営業利益に分子を差し替える。**新しい金利想定を置かない**(置くとD-5.1が禁じる未実証の定量モデルになる)
- 分母が0の比率は `null`(0や近似値で埋めない)
- M5は AssumptionEntry を生成しない(M8 D-1の記録要求の対象外。判断が発生しないため)
- 報告営業利益に通常NPVを流用していたデモ実装を、企業提供の財務データに分離した

**あわせて修正した設計上の穴(RESULT_SCHEMA_VERSION):** ページは保存済みrunを読むため(計画B-2)、**結果の構造を変えると古い形のrunを新しいコードが読んで500になる。**実際にこの実装中に踏んだ。`pipeline_run.result_schema_version` を追加し、版が違えば読み出し時に自動再実行する。古いrunは削除せず残す。

**以下は当初の作業メモ(履歴として残す):**

### T-06 GAP-10 M5パイプラインと比較先

**やること:**
1. `packages/core/src/pipeline/financial-bridge-pipeline.ts` を新設(他の4本と同じ形。AssumptionEntryの後処理も同形式)
2. `computeComparisonTargets()` の入力を変える。現在 `leverage: {before, after}` を**両方とも企業提供**で受けているが、要件§5.2は `after` を自然債務から算術で導出せよと定めている
3. 財務画面に比較先3種(営業利益比・減損テスト前提への影響・格付/資本コストの定性記述)を表示する

**構造制約:** 2つのブリッジを合算できる関数を作らない。厚生価値をDecisionRecordに繋がない(X7)。固定テンプレート文言の生成にAIを使わない(D-5.2)。

**完了条件:** 財務画面に比較先が表示され、変化後の比率がPRISMの算出結果になっている。

---

### T-08〜T-11 DB基盤(波B)【完了。詳細は design-rationale-log D-112】

**動かし方:**

```bash
cp .env.example .env     # 初回のみ。PRISM_API_KEY に任意の値を入れる
npm run db:up            # Postgres(compose.yaml。ホスト側ポート5433)
npm run db:migrate       # スキーマ + 追記のみの権限設定
npm run dev              # 最初のrunは初回アクセス時に自動作成される
npm run test:db          # 追記のみの権限テスト + 永続化のラウンドトリップ(15件)
```

**実装したもの:**
- `lib/db/`(schema / client / migrations / repositories / serialize)、`lib/pipeline/execute-run.ts`
- ユーザー操作は `interaction_event` への追記。現在値は最新イベントの射影(`lib/demo/interaction-state.ts`)
- 計算結果は `pipeline_run` のスナップショット。ページは最新runを読むだけで再計算しない
- 台帳・run系テーブルは `prism_app` ロールから `UPDATE`/`DELETE` を剥奪(DBが物理的に拒否)
- `packages/core` の変更は rng 注入口の追加のみ(`monetization/rng.ts` を新設し、テスト・デモの重複実装を集約)。`Math.random` のグローバル差し替え(D-103)は廃止
- 出力APIは fail closed(キー未設定=503、不一致=401)

**計画から変えた点:** `db:seed` スクリプトは作らなかった。Node の型ストリッピングが tsconfig の path エイリアスを解決できず、seed だけのためにローダーを足す価値がないと判断した。**最初のrunは初回アクセス時に自動生成される**(`getOrCreateLatestResult`)ため、seedがなくても起動できる。永続化の検証は `lib/db/persistence.db.test.ts` が担う。

**以下は当初の作業メモ(履歴として残す):**

### T-08〜T-11 DB基盤(波B)

**T-08 足場:**
- `compose.yaml`(db: postgres、app: 開発時はローカル実行でも可)
- `drizzle.config.ts`、接続設定(環境変数)
- `.env.example`(実際の `.env` はコミットしない)

**T-09 スキーマ:**
- `packages/core/src/types/` の型をそのまま写す。**型定義を変えない**(ADR-0003で「通過したら破壊的変更は原則しない」と決めている)
- 追記のみのテーブル(AssumptionEntry / VersionedParameterSet / BindingMechanismChangeEntry)は、アプリ用ロールから `UPDATE`・`DELETE` を剥奪する
- 計算結果テーブルは**上書きしない。**`recalculationHash` 単位で新しい行を積む(T-13の旧版再計算の前提)

**T-10 テナント分離:** Row Level Security。パイロット3〜5社を分離できれば十分(build-plan §6)。出力API `/api/pipeline-result` は**現在無認証で全データを返す。**DBを入れる前に認証を付ける(GAP-16。実データが入った瞬間に漏洩経路になる)

**T-11 移行:** `lib/demo/site-store.ts`・`interaction-store.ts` をDBに置き換える。デモ層の `Math.random` 差し替え(D-103)は、**結果を永続化するようになれば不要になる**ので廃止し、代わりに `combineUncertainty()` のrng注入口を公開APIとして出す

---

## 4. 本計画で扱わないもの

| 対象 | 理由 |
|---|---|
| GAP-04(ジオコーディング・空間レイヤ) | ライセンス契約待ち(`acquisition-runbook.md` B-1) |
| GAP-05(M7段階1・2) | AI提供者の決定と顧客同意待ち(E-3・B-6) |
| GAP-11(炭素価格シナリオ) | NGFS・GX-ETS一次資料待ち(A-2・A-3)。**現在のラベルのみ実装を維持するのが正しい** |
| GAP-14(カテゴリスコープ) | E-1の判断待ち |
| GAP-19〜21 | 既存文書で後回しと決定済み |
| 係数の実値の差し替え | 契約待ち。プラグイン構造は完成しているので、値だけ後から入る |
