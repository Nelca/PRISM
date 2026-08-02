# 実データ受け入れガイド

**対象読者:** デザインパートナー企業の担当者、およびPRISM運用チーム。
**目的:** LOI締結後、実際の拠点データを受け取ってPRISMのパイプライン(M1〜M8)に投入するための、3つの入力ファイルの記入方法を説明する。
**関連コード:** `lib/intake/`(パーサ・検証ロジック)、`lib/intake/templates/`(記入例)。
**最終更新:** 2026-08-03

---

## 0. 全体像:3つのファイルと、それぞれの記入者

実データの投入には、性質の異なる3つのファイルが必要です。**単一のフォームに全社員が記入する形にはしていません** — データの出どころが違うためです。

| ファイル | 記入者 | 内容 |
|---|---|---|
| `sites.csv` | **①顧客(サステナビリティ/IR部門等)** | 拠点一覧 |
| `nature-interfaces.csv` | **②PRISM運用チーム** | 拠点ごとの保護区近接・水ストレス・ENCORE依存度等の調査結果 |
| `engagement-config.json` | **②PRISM運用チーム(顧客ヒアリングをもとに作成)、③顧客財務部門の情報を含む** | 貨幣化の設定・対策・通常NPV・承認閾値・拘束方式・開示claim |

`lib/intake/templates/`に記入例が用意されています。まずこれをコピーして書き換えるのが早道です。

---

## 1. `sites.csv`(①顧客が記入)

```csv
site_id,name,site_type,industry_sector,lat,lng,address
site-001,本社工場,own_site,chemicals,35.1,136.9,
site-002,海外サプライヤー,supplier_site,textile,,,〇〇県〇〇市...
```

| 列 | 必須 | 説明 |
|---|---|---|
| `site_id` | ○ | 拠点を一意に識別するID(半角英数字とハイフン推奨)。他のファイルからもこのIDで参照する |
| `name` | ○ | 拠点名 |
| `site_type` | ○ | `own_site`(自社拠点)または `supplier_site`(サプライヤー拠点) |
| `industry_sector` | ○ | 業種(自由記述) |
| `lat`, `lng` | △ | 緯度・経度。わかる場合は両方埋める |
| `address` | △ | 住所。座標がわからない場合はこちらを埋める |

**`lat`/`lng`と`address`はどちらか一方があればよい。** 両方空欄の行はエラーになり、その拠点は投入できない(座標も住所もなければLocateが実行できないため)。`#`で始まる行はコメントとして無視される。

**座標も住所も本当にわからない場合は、その拠点を除外して進めることができる。** 除外は黙って消えるのではなく、監査可能な記録として残る(M1 D-3)。

---

## 2. `nature-interfaces.csv`(②PRISM運用チームが記入)

```csv
site_id,layer_type,data_source,raw_result,license_mode
site-001,kba,IBAT Alliance,true,pending_review
site-001,water_stress,WRI Aqueduct 4.0,true,reference_only
```

**顧客は記入しない。** `sites.csv`の座標をもとに、PRISM運用チームがWDPA/IBAT・WRI Aqueduct・ENCORE等(ライセンス契約締結前は手動でのGIS確認・文献参照)を調べて記入する。

| 列 | 必須 | 説明 |
|---|---|---|
| `site_id` | ○ | `sites.csv`のIDと一致させる |
| `layer_type` | ○ | `protected_area` / `kba` / `water_stress` / `ecosystem_integrity` / `dependency_impact` のいずれか |
| `data_source` | ○ | 出典(自由記述。例: `IBAT Alliance`, `WRI Aqueduct 4.0`, `ENCORE`) |
| `raw_result` | △ | `true` / `false`、または数値(STARスコア等)。**空欄にすると「未評価」を意味し、その基準はMaterialIssueの判定に使われない**(falseとして扱われるわけではない、という違いに注意) |
| `license_mode` | ○ | `embedded` / `reference_only` / `bring_your_own_license` / `pending_review` のいずれか。ライセンス契約が未締結のデータソースは`pending_review`にする |

---

## 3. `engagement-config.json`(②PRISM運用チーム作成、③顧客財務部門の情報を含む)

JSON形式。`lib/intake/templates/engagement-config.json`に完全な記入例がある。主要な項目:

### 3.1 貨幣化の設定(`deepDive` / `methodConfig` / `calibration`)

深掘り評価の対象とする拠点・物理量(例:年間取水量)・手法設定(代替費用単価、IFVI/LIME3係数等)。**IFVI/LIME3の係数自体は顧客が用意するものではなく、PRISM運用チームが各手法の公表資料から引き当てる。** `unitReplacementCost`(代替調達コスト単価)のみ顧客提供のデータ。

**物理量の粒度に注意(build-plan §7.1の既知の詰まりどころ)。** 顧客から提供される物理量データが月次・日次の場合、年次に集計してから`physicalQuantity`に入れること。粒度が揃っていないと、M4以降の分解結果の解釈が混乱する。

### 3.2 通常NPV・承認閾値・拘束方式(`baselineNpv` / `approvalThreshold` / `bindingMechanism`)

`baselineNpv`(通常NPV)・`bindingMechanism`(拘束方式)は顧客が持つデータ・意思決定。**`approvalThreshold`(承認閾値)は`"pending"`(未定)を入れて先に進めてよい。**

```json
"approvalThreshold": "pending"
```

または

```json
"approvalThreshold": { "value": 1200000000, "source": "manual_entry" }
```

**承認閾値は経理・経営企画部門の管轄で、サステナビリティ担当者が把握していないことが多い(design-rationale-log R-1)。** 無理に聞き出そうとせず、`"pending"`のまま先に進めることを勧める。自然調整後NPVのレンジ自体は`"pending"`でも算出され、★判定(投資判断への影響)だけが保留される(M6 D-10)。

### 3.3 対策(`countermeasures`)

対策(節水設備投資等)とその投資額・削減見込み額。`avoidedNatureCost[].sourceValuationMethodId`は、実際のValuationRecordのIDではなく**手法ID**(例:`"replacement-cost"`)を指定する。ValuationRecordのIDはM3実行時に動的に生成されるため、投入時点では手法IDで参照しておき、パイプライン実行時に解決される。

### 3.4 開示claim(`disclosureClaims`)

過去の統合報告書・TCFD開示等からの主張文。**現時点ではAIによる自動抽出は行っておらず、PRISM運用チームが該当箇所を読み、手動で構造化データに落とし込む**(M7段階1・2はスコープ外、`docs/requirements/m7-disclosure-verification.md`参照)。`category`・`periodMentioned`・`scopeMentioned`は、M3・M4の出力と構造的フィールドの完全一致で照合されるため、**表記を`sites.csv`・貨幣化設定と揃えること。** 揃っていないと、実際には根拠があるのに「範囲不一致(G3)」と誤判定される(意味的な類似判定は行わない設計、M7 D-2)。

---

## 4. 投入方法(現時点)

```ts
import { loadCompanyDataset } from "@/lib/intake/load-company-dataset";
import { readFileSync } from "node:fs";

const { dataset, errors } = loadCompanyDataset(
  readFileSync("path/to/sites.csv", "utf-8"),
  readFileSync("path/to/nature-interfaces.csv", "utf-8"),
  readFileSync("path/to/engagement-config.json", "utf-8")
);

if (errors.length > 0) {
  console.error(errors); // どの行・どの項目が不正かを具体的に示すエラーメッセージ
}
```

`dataset`が得られたら、`packages/core/src/pipeline/*`(`runAssessmentPipeline`・`runValuationPipeline`・`runDecisionPipeline`・`runDisclosurePipeline`)にそのまま渡せる。実際の組み立て方は`lib/intake/templates.test.ts`を参照(記入例からM1〜M7まで通しで実行する完全なコード例になっている)。

**UIからのファイルアップロード機能はまだない。** 現時点ではこのようにコードから直接読み込む運用を想定している。

---

## 5. build-plan §7.1「よくある詰まり方」との対応

| 詰まり方 | このテンプレートでの対応 |
|---|---|
| 拠点の座標がない(M1) | `address`列で住所を許容。座標も住所もない場合は除外理由付きで記録される |
| 物理量の粒度が年次でない(M2) | §3.1参照。年次への集計はPRISM運用チーム側で行う |
| 手法のメタデータが欠けフォールバックだらけになる(M3→M4) | `nature-interfaces.csv`・`engagement-config.json`の必須項目検証で、記入漏れを早期に検出する |
| 承認閾値を誰も教えてくれない(M6) | §3.2参照。`"pending"`のまま先に進められる |
| 過去の開示PDFが表形式で抽出できない(M7) | 現時点では手動記入前提(§3.4)。将来のAI抽出機能はスコープ外 |
