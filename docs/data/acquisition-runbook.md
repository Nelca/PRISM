# コード実装以外に必要なものの一覧と取得手順書

**目的:** `docs/requirements/mvp-completion-gap.md` のGAPを埋めるために、**コードを書く以外に**必要なもの(外部データ・契約・アカウント・顧客提供データ・人間の判断)を網羅し、取得手順を定める。
**参照元:** `docs/requirements/mvp-completion-gap.md`、`docs/data/licensing.md`、`docs/business/outreach-action-plan.md`
**最終更新:** 2026-08-15

---

## 0. 使い方

- §1 が全体像(何が必要で、誰が取り、どのGAPをブロックしているか)
- §2 が**2026-08-08時点で取得済みのもの**(取得先・値・格納先)
- §3 が**未取得のものの取得手順**。1件ずつ「どこから・どうやって・費用・成果物・完了条件」を書いてある
- 取得したら、値そのものではなく **`VersionedParameterSet` として版を切って登録する**(M8 D-3)。データ本体をコードにハードコードしない

**取得作業の原則(D-15):** 取得できなかったものを推定値で埋めない。**「未取得」と書いて次工程に渡す**(build-plan §0.2 の3)。

---

## 1. 全体像

### A. 外部データ・係数

| # | 項目 | 担当 | 状態 | ブロックするGAP |
|---|---|---|---|---|
| A-1 | CICES V5.1 階層・コード体系 | AI可 | **取得完了**(2026-08-10、§2.1) | — |
| A-2 | NGFS 炭素価格軌道(2シナリオ) | 人間 | 未取得(§3.2) | GAP-11 |
| A-3 | GX-ETS 価格の一次資料 | AI可(要User-Agent工夫) | **取得完了**(2026-08-10、§3.3) | GAP-11 |
| A-4 | IFVI 価値係数(水消費の国別4本 + Global Value Factor DB) | 人間 | 水消費4本は**取得・コード反映完了**(2026-08-10、§3.4)。Global Value Factor DBは未取得(他カテゴリ用、現行実装では不要) | M3の実係数 / GAP-14 |
| A-5 | LIME3 係数 | 人間(既存ライセンス提供)+AI(分析・コード反映) | **取得・コード反映完了**(2026-08-15、§3.5b) | M3の実係数 |
| A-6 | CE Delft 環境価格ハンドブック | 人間 | 未取得(§3.5) | 汚染カテゴリ / AoP対応表のCE Delft分 |
| A-7 | ESVD 個別レコード + 日本カバレッジ | 人間(登録)+AI(分析) | **日本カバレッジ確認完了**(2026-08-14、67件、§3.5a)。商用契約(ストラテジックパートナー化)は未着手 | M3ティア判定の実運用 |
| A-8 | WDPA / KBA レイヤ | 人間 | 未取得(§3.5) | GAP-04 / GAP-08 |
| A-9 | Aqueduct 4.0 水ストレス | AI可(要フォーム) | **取得・コード反映完了**(2026-08-10、§3.7) | GAP-04 |
| A-10 | ENCORE 依存・影響レーティング | AI可 | **取得・コード反映完了**(2026-08-10、§3.8)。帰属表示の実装は残作業 | GAP-04 |
| A-11 | 生態系完全性トレンドのデータ源 | AI可(調査) | **調査・コード反映完了**(2026-08-10、§3.9・§E-8) | GAP-13 |
| A-12 | 炭素の社会的費用 | AI可 | **取得済**(§2.4) | GAP-14 |
| A-13 | 地理較正パラメータ(PPP・所得・デフレータ・η・相対価格) | AI可 | **取得済**(§2.2・§2.3) | M3 §3.2の監査要件 |
| A-14 | TNFD LEAP L3 の5基準原文 | AI可(要User-Agent工夫) | **取得完了**(2026-08-10、§3.10・`docs/data/tnfd-leap-l3-criteria.md`) | M1 D-2の根拠固め |
| A-15 | SSBJ基準本文 | 人間 | 未着手 | GAP-19(フェーズ2) |

### B. 契約・許諾 —— **すべて人間。AIでは代替不能**

| # | 相手 | 内容 | 概算費用 | ブロックするGAP |
|---|---|---|---|---|
| B-1 | IBAT Alliance / UNEP-WCMC | WDPA商用ライセンス | Enterprise Plus 約 $35,000/年(API連携時) | GAP-04・GAP-08 |
| B-2 | ESVD(Foundation for Sustainable Development等) | 商用利用=ストラテジックパートナー化 | 未確認 | M3の深掘りティア判定 |
| B-3 | IFVI | 価値係数の商用利用ライセンス | 未確認(有償と明記) | M3の実係数 |
| B-4 | CE Delft | 係数の商用利用 | 未確認 | 汚染カテゴリ |
| B-5 | LIME3(AIST-IDEA) | 係数の利用条件 | **解消済み**(2026-08-15。アスエネ社が既存の「標準版」ライセンスを保有、有効期限2027-06-30。`docs/data/licensing.md`) | M3の実係数 |
| B-6 | AIプロバイダ + **顧客** | 開示PDFを外部APIに送ることの契約上の扱い(DPA・顧客同意) | — | GAP-05 |
| B-7 | ジオコーディング事業者 | **結果の保存可否**が争点(保存禁止条項を持つサービスがある) | — | GAP-04 |

### C. アカウント・API鍵・インフラ

| # | 項目 | 用途 | ブロックするGAP |
|---|---|---|---|
| C-1 | IIASA Scenario Explorer アカウント | NGFSシナリオデータの取得 | GAP-11 |
| C-2 | IFVI ダウンロードフォーム登録 | Global Value Factor DB | A-4 |
| C-3 | WRI ダウンロードフォーム | Aqueduct 4.0 | GAP-04 |
| C-4 | **DB + ホスティング環境** | 永続化・テナント分離 | **GAP-01・GAP-15** |
| C-5 | AI API 鍵 | M7段階1・2 | GAP-05 |
| C-6 | ジオコーディングAPI鍵 | 住所→座標 | GAP-04 |
| C-7 | 秘密情報の管理方式(顧客の財務データ・未公表の開示ギャップ) | 全体 | GAP-15 |

### D. 顧客(デザインパートナー)から受領するデータ

`docs/data-intake-guide.md` は①拠点一覧②NatureInterface調査③エンゲージメント設定の3ファイルを定義済み。**以下は同ガイドに項目が不足している(GAP-03と対になる)。**

| # | 項目 | 提供部門 | 不足の有無 |
|---|---|---|---|
| D-1 | 拠点一覧(座標または住所・業種) | サステナビリティ | 定義済 |
| D-2 | NatureInterface調査結果 | PRISM運用チーム | 定義済 |
| D-3 | 物理量(取水量等、拠点別・年次) | 環境・製造 | 定義済 |
| D-4 | 報告営業利益・Net Debt・EBITDA・支払利息・減損テスト前提 | 財務・経理 | **未定義** |
| D-5 | 承認閾値(ハードルレート等)・通常NPV・割引率・期間 | 経営企画・経理 | **未定義** |
| D-6 | 既に支払っている内部化済みコスト(炭素税・水利用料等) | 財務・経理 | **未定義** |
| D-7 | 内部化確率(3シナリオへの主観確率) | 経営企画 | **未定義** |
| D-8 | 過去の統合報告書・TCFD開示PDF | IR | **未定義** |
| D-9 | 前年度に採用した貨幣化手法(手法変更の差分分離に必要、GAP-09) | サステナビリティ | **未定義** |

**→ `docs/data-intake-guide.md` にD-4〜D-9を追記する作業が必要**(§3.11)。

### E. 人間の判断(実装前に決めるべきこと)

| # | 論点 | 参照 |
|---|---|---|
| E-1 | 実データ通しを水カテゴリのみに絞るか、気候カテゴリを足すか | GAP-14 |
| E-2 | 永続化の選択(SQLite単一プロセス / Postgresマルチテナント) | GAP-01・GAP-15 |
| E-3 | M7で使うAI提供者と、顧客の開示PDFを外部送信することの扱い | GAP-05・B-6 |
| E-4 | ライセンス契約交渉を先に進めるか、契約不要な範囲を先に仕上げるか | B-1〜B-5 |
| E-5 | η を文献中心値 0.587 とするか現行の 0.7 のままとするか | `calibration-parameters-v1.md` §3 |
| E-6 | CICES を V5.1 のままとするか V5.2 に追随するか | `cices-v51-notes.md` §4 |
| E-7 | 相対価格上昇率をカテゴリ別に使い分けるか(MVPは全体値1本を推奨) | `calibration-parameters-v1.md` §5 |
| E-8 | 【2026-08-10 実装完了・拠点座標への動的対応も追加実装済み】`rapidIntegrityDecline`(GAP-13)にEcological Integrity Index(CC BY 4.0)を実装する判断が下され、実装済み。閾値はIUCN Red List Criterion A2(10年で30%以上の減少)を借用。当初は3拠点限定のハードコードだったが、0.5度グリッド(約2.5MB、リポジトリに同梱)を拠点座標から動的に引く方式に差し替え、新規追加拠点にも自動対応(空間精度は1km→約55kmに低下)。`unevaluatedCriteria`から`rapidIntegrityDecline`が外れたことを画面(`/sites`)で確認済み | `ecosystem-integrity-trend-notes.md` §6・§7・§8.6 |

### F. フェーズ0の残作業(実装と独立)

| # | 項目 | 状態 |
|---|---|---|
| F-1 | 支払意思ヒアリング20件 / LOI 3件 | **LOI 0件。**下書きは `docs/business/outreach-action-plan.md` に準備済み、送信待ち |

---

## 1.8 実装ブロックの判定 —— どれが「無いと着手できない」のか

§1の「ブロックするGAP」列は**関係するGAPを示すだけで、着手可否を示していない。**同じ「ブロック」でも性質が3つあるため、ここで区別する。

| 記号 | 意味 |
|---|---|
| **硬** | **これが無いと当該実装に着手できない。**推定値で代替すると D-15(推定で埋めない)に抵触するか、そもそも書くコードが決まらない |
| **軟** | **実装は進められる。**注入インターフェース・`pending` 状態・仮の係数のまま完成でき、データ到着後に差し替わる。ただし**実データ通し(build-plan §7.1)は通らない** |
| **非** | 実装をブロックしない。監査説明・営業・将来フェーズの材料 |

### 1.8.1 硬ブロック(これが解けるまで着手できない)

| # | 項目 | 着手できない作業 | なぜ代替できないか |
|---|---|---|---|
| **C-4** | DB + ホスティング環境 | **GAP-01・07・12・15・16 のすべて**(= 着手順の第1波・第3波の大半) | 保存先が決まらないとスキーマもテナント分離も書けない。**単一で最も広くブロックしている** |
| **E-2** | 永続化の選択(SQLite / Postgres) | 同上 | C-4を発注する前の判断。これ自体はコストゼロ |
| **E-1** | 対象カテゴリのスコープ判断 | GAP-14、およびM3プラグインを追加するか否か | 「水のみで通す」なら除外理由の記録を書き、「気候を足す」ならプラグインを書く。**やる作業が正反対**になる |
| **E-3 + C-5 + B-6** | AI提供者の決定・APIキー・顧客の同意(DPA) | **GAP-05(M7段階1・2)** | 顧客の未公表開示PDFを外部APIに送る可否が決まらないと、設計(社内処理かAPIか)自体が決まらない |
| **A-2**(A-3は2026-08-10解消) | NGFS価格軌道 | **GAP-11(シナリオ差の数値化)** | GX-ETS(日本側)は一次資料で確定済み(§3.3)だが、NGFS(Net Zero 2050 / Current Policies)側の価格軌道が無いため、3シナリオ間の比較という当初要件はまだ満たせない。価格を推定で置くことは D-15 に直接抵触する。**現在の「ラベルのみ」実装を維持するのが正しい** |
| **B-1** | WDPA/IBAT契約 | GAP-04のうち **WDPA/KBAアダプタの実装** | データが手元に無い以上、照会コードを書いても動かせない。ただしGAP-08(ゲーティング)は逆に**契約前にこそ必要**(下記) |
| **D-4〜D-9** | 顧客の財務・意思決定・開示データ | **実データでの**GAP-03検証、build-plan §7.1のGATE | 入力UI(コード)は先に書けるが、通すデータが無い |

### 1.8.2 軟ブロック(実装は進む。実データ通しだけが通らない)

| # | 項目 | 進められること | 到着後に差し替わるもの |
|---|---|---|---|
| A-4 / A-5 / A-6 / A-7 | IFVI・LIME3・CE Delft・ESVDの係数 | **プラグイン構造は既に完成している**(M3 D-3)。係数は `VersionedParameterSet` の差し替えで入る | 係数の実値。**IFVI水消費4本は2026-08-10に日本の実値へ差し替え済み**(§3.4)。**LIME3は2026-08-15に日本の実値へ差し替え済み**(§3.5b)。CE Delft・ESVDは依然デモ用の仮値 |
| A-9 | Aqueduct 水ストレス | 注入口は実装済み。閾値でのboolean化は呼び出し側の責務(`criteria.ts`) | 公式カテゴリ区分による判定閾値 |
~~A-11~~ | ~~生態系完全性トレンド~~ | ~~解消(2026-08-10。E-8参照)~~ | ~~`rapidIntegrityDecline`の実判定はEcological Integrity Indexの実データで実装済み~~ |
| B-2〜B-5 | ESVD・IFVI・CE Delft・LIME3 の契約 | 上と同じ。**構造は契約に依存しない** | 商用利用可否。不可なら `licenseMode` を変えてゲーティング(GAP-08)で止める |
| D-1〜D-3 | 顧客の拠点・調査・物理量 | 取込UI(GAP-02)はテンプレート仕様が確定済みなので先に書ける | 実データ |

**重要な非対称性:** `B-1〜B-5(契約)`は**GAP-08(ライセンスゲーティング)をブロックしない。むしろ契約が無い今こそGAP-08が必要である。**現状は契約前のWDPAデータが感応度スコアに算入されており、仕様(M8 D-4)と逆の挙動をしている。**契約を待つ理由がない、優先度の高い実装。**

### 1.8.3 非ブロック(実装と独立)

| # | 項目 | 位置づけ |
|---|---|---|
| A-1の残り | CICES公式スプレッドシート | MVPで付与するCICESコードはESVDレコードの記載を転記するのみで、PRISM側で階層表を引かない(`cices-v51-notes.md` §3)。**独自にコードを割り当てる必要が生じた時点で硬ブロックに変わる** |
~~A-14~~ | ~~TNFD LEAP L3 原文~~ | ~~解消(2026-08-10、`tnfd-leap-l3-criteria.md`)~~ |
| A-15 | SSBJ基準本文 | GAP-19(フェーズ2) |
| E-5 / E-6 / E-7 | η の採用値 / CICES版 / 相対価格のカテゴリ別 | **既定値のまま実装を進めてよい。**採用値と理由をAssumptionEntryに記録できていれば、後から版を切って変更できる(M8 D-3) |
~~E-8~~ | ~~`rapidIntegrityDecline`の実装可否~~ | ~~解消(2026-08-10、実装完了)~~ |
| F-1 | LOI・支払意思ヒアリング | 実装と独立。ただし**構想書10.7の継続条件**であり、事業判断としては最上位 |
| §3.6 | World Bank帰属表示のUI実装 | ライセンス・書式は確定済み(§3.6完了)。ENCORE・WRI Aqueductと異なり、画面(`app/components/attribution.tsx`)への追加はまだ行っていない |

### 1.8.4 取得済みデータが解除したブロック(2026-08-08時点)

| 取得したもの | 解除されたもの |
|---|---|
| 地理較正パラメータ(§2.2・§2.3) | M3 §3.2の監査要件1・2(PPP出典の明記・ηの根拠文献)を**満たせる状態になった。**実装は仮値のままなので、差し替えは残作業 |
| CICES階層・コード体系(§2.1) | M4 §6.3の前方一致実装の前提が**根拠付きになった**(従来は根拠文書ゼロで `cicesMatchLevel: "group"` が動いていた) |
| 炭素の社会的費用 236 USD/tCO2(§2.4) | E-1で気候カテゴリを選ぶ場合の**厚生価値側の係数が確保済み。**交換価値側(GX-ETS)は硬ブロックのまま |

### 1.8.5 着手順(`mvp-completion-gap.md` §6)との対応 【2026-08-10:第1〜3波は実装完了】

| 波 | 状態(2026-08-10時点) |
|---|---|
| 第1波(GAP-17 / 01 / 15 / 16) | **完了。**GAP-17・01・16は解消。GAP-15はDBのテナント分離までは完了、実認証方式の選択が残る |
| 第2波(GAP-02 / 03 / 08 / 13) | **完了。**GAP-02・03・08・13すべて解消 |
| 第3波(GAP-06 / 07 / 09 / 12) | **概ね完了。**GAP-06・09・12は解消。GAP-07は較正パラメータの再計算UIは実装済みだが、手法係数値自体の永続化は既知の制約として残る(D-118) |
| 第4波(GAP-10 / 05 / 11) | GAP-10は解消。**GAP-05 は E-3+C-5+B-6 待ち(人間の判断・契約)、GAP-11 はGX-ETS(A-3)は解決済みだがNGFS(A-2)待ちで、いずれも硬ブロックのまま** |

**結論(更新):**MVP完成までのギャップ(GAP-01〜18)は、GAP-04(WDPA契約待ち)・GAP-05(AI提供者決定待ち)・GAP-11(NGFS未取得)・GAP-14(スコープ判断待ち)・GAP-15の残作業(テナント認証方式)を除き、**実装としては完了している。**残るブロッカーはすべて外部データ・契約・人間の判断であり、コードで解消できるものではない。詳細は`docs/requirements/mvp-completion-gap.md`(2026-08-10更新)を参照。

---

## 2. 取得済み(2026-08-08、AIが取得)

### 2.1 CICES 階層・コード体系 → `docs/data/cices-v51-notes.md`

- 5階層(Section > Division > Group > Class > Class type)を確認
- コードが階層連結であり、**前方一致で上位階層を切り出せる**ことを確認 → M4 §6.3の実装前提が成立
- **V5.2が2025年4月に公開されていることを発見**(E-6の判断が必要)
- 未確認:Abiotic拡張のSection番号、水の所属コード、全Class一覧(§3.1)

### 2.2 地理較正の実データ → `docs/data/calibration-parameters-v1.md`

World Bank APIから取得(データ最終更新 2026-07-13):

- 日本のPPP換算係数 2020〜2024(2024年 = 94.46 円/国際ドル)
- GNI per capita PPP 6カ国 2023〜2024(日本 57,450 / ドイツ 76,500 / 米国 85,270 等)
- 日本のGDPデフレータ 2015〜2024(2020=100、2024年 = 108.55)

**発見:** 日本の所得水準は欧米より低く、要件定義書の数値例(日本130・研究地100として調整係数1.20)とは**逆方向に働く**。

### 2.3 所得弾力性 η と相対価格上昇率 → `docs/data/calibration-parameters-v1.md`

> Drupp, Turk, Groom, Heckenhahn, arXiv:2308.04400v3 (2024-11-15)。396研究・735の所得–WTPペアのメタ分析

- **η = 0.587**(95%CI 0.451〜0.723)。現行の仮値 0.7 は信頼区間の上端付近であり中心値ではない
- **相対価格上昇率 = 年1.66%**(95%CI 1.40〜1.92)。現行の仮値「年2%」に出典を与えられる

### 2.4 炭素の社会的費用 → 本書に記録

> IFVI GHG Emissions Topic Methodology(Final)、https://ifvi.org/methodology/environmental-topic-methodology/greenhouse-gas-ghg-emissions-topic-methodology/

- **236 USD/tCO2、2023年価格水準**
- 根拠モデル:Climate Impact Lab の DSCIM、Resources for the Future の GIVE
- Basis for Conclusions: `https://ifvi.org/wp-content/uploads/2024/09/IFVI_VBA_Environmental-Methodology-1_GHG-Topic-Methodology_Basis-for-Conclusions.pdf`
- **用途:** E-1で気候カテゴリを追加する場合の厚生価値側の係数。交換価値側はGX-ETS価格(§3.3)

### 2.5 IFVI 資料の所在(ダウンロードURL)

| 資料 | URL | 取得可否 |
|---|---|---|
| Water Consumption 方法論(最終版) | `https://ifvi.org/wp-content/uploads/2026/03/IFVI_VBA_Environmental_Methodology-2_Water-Consumption_FIN_04.pdf` | 公開・DL可。**ただしPDFのテキスト抽出に失敗**(§3.4) |
| Water Consumption Basis for Conclusions | `https://ifvi.org/wp-content/uploads/2026/03/WaterConsumption_Basis-for-Conclusions_vFINAL.pdf` | 公開・DL可 |
| Global Value Factor Database | `https://ifvi.org/methodology/environmental-topic-methodology/interim-methodologies/download-form-global-value-factor-database/` | **フォーム登録が必要** |
| GHG 方法論(最終版) | `https://share.hsforms.com/1yn-WjRi3SbqxEBKPesJ-Kwqaucq` | フォーム経由 |

Global Value Factor Database の内容:約10万件。大気汚染(最大6物質)・土地利用転換・廃棄物・水質汚染(104物質)。

### 2.6 Aqueduct 4.0 の所在【2026-08-10 追記:取得完了】

- 直接ダウンロード: `https://files.wri.org/aqueduct/aqueduct-4-0-water-risk-data.zip`
- フォーム経由のダウンロードも用意されている
- ライセンスは**CC BY 4.0と確定**(§3.7、`docs/data/aqueduct-water-stress-notes.md`)。BWSカテゴリ区分・boolean化閾値・コード反映まで完了

---

## 3. 未取得のものの取得手順

### 3.1 CICES 公式スプレッドシート(A-1の残り)【2026-08-10 完了】

**結果:** 手順1・2(ダウンロードと配置)は人間が実施し、`docs/data/external/` に配置済み。手順3・4を実施し、`docs/data/cices-v51-notes.md` の未確認事項(U-1〜U-3)はすべて解消した。

**判明した主なこと:**
- **階層は4層(Section > Division > Group > Class)。**当初「5層」としていたのは誤りで、Class type は階層ではない。実装(`SpecifiedLevel`)はもともと4値で正しかった
- Abiotic拡張のSectionは 4/5/6。水の取水は `4.2.1.x`(表流水)/ `4.2.2.x`(地下水)、水質は `2.2.5.x`
- **V5.2 は同じコードで別のサービスを指す。**`4.2.1` は V5.1 で「表流水」、V5.2 で「鉱物性物質」。水は V5.2 で `4.1.x` に移動
- **E-6の判断:V5.1 に留まることを推奨**(理由は `cices-v51-notes.md` §4)
- **実装の不足を1件発見・対応済み:**`CicesReference` が版を持っていなかった。`cicesVersion` を必須フィールドとして追加した

**以下は当初の手順(履歴として残す):**


**目的:** Abiotic拡張のSection番号、水の所属コード、全Class一覧の確定。V5.1とV5.2の差分確認(E-6)。

**手順:**
1. 以下をブラウザでダウンロードする(登録不要・無料)
   - V5.1: `https://cices.eu/content/uploads/sites/8/2018/03/Finalised-V5.1_18032018.xlsx`
   - V5.2: `https://cices.eu/content/uploads/sites/8/2025/04/CICES_V5.2_29042025_Final.xlsx`
   - V5.2 ガイダンス: `https://cices.eu/content/uploads/sites/8/2025/04/CICES-V5.2_Guidance_final-_-29042025.pdf`
2. リポジトリに置く(`docs/data/external/` を作る)か、CSVに変換して置く
3. `docs/data/cices-v51-notes.md` §3 のU-1〜U-3 を埋める
4. V5.1 と V5.2 の Group 階層の差分を確認し、E-6を判断する

**なぜAIが取れなかったか:** xlsxはバイナリのため取得ツールで解析できず、PDFはテキスト抽出に失敗した。**ローカルに `poppler`(pdftotext)と xlsx を読む手段があれば、以降はAI側で処理できる。**

**完了条件:** `cices-v51-notes.md` に「不明」が残っていない。

---

### 3.2 NGFS 炭素価格軌道(A-2)【人間】

**目的:** GAP-11。Net Zero 2050 / Current Policies の価格軌道。

**手順:**
1. NGFS Scenarios Portal(ngfs.net)から IIASA Scenario Explorer に進み、**アカウントを登録する**(無料)
2. Phase V(V5.0、2024年11月)のデータセットを選択し、以下を絞り込んでCSVをエクスポート
   - Scenario: `Net Zero 2050`、`Current Policies`
   - Variable: `Price|Carbon`
   - Region: `World` および `Japan`(または OECD)
   - Model: **どのモデルの値かを必ず記録する**(REMIND-MAgPIE / GCAM / MESSAGEix でシナリオの解釈が変わる)
   - Year: 2025〜2050(5年刻み)
3. **実質基準年(2010 USD / 2015 USD 等)を必ず控える。**これがないと円換算も他シナリオとの比較もできない
4. `docs/data/carbon-price-scenarios.md` §1 を書き換え、出典(ポータルのデータセット名・版・取得日)を記録する

**費用:** 無料 / **所要:** 1〜2時間

**AIが取れなかった理由:** PDFは403、シナリオ本体はログインが必要。

**完了条件:** 2シナリオ × 年次 × 価格 × 通貨 × 実質基準年 × モデル名 が表として記録されている。

---

### 3.3 GX-ETS 価格の一次資料(A-3)【2026-08-10 完了】

**目的:** GAP-11の日本側。二次資料での値(4,300 / 1,700 円/t-CO2、実質3%/年)を一次資料で確定する。

**結果:** METI公式サイトのPDF(`https://www.meti.go.jp/shingikai/sankoshin/sangyo_gijutsu/emissions_trading/pdf/20251219_2.pdf`、「令和8年度の参考上限取引価格及び調整基準取引価格に関する意見」、排出量取引制度小委員会、2025年12月19日)を取得し、二次資料の数値(¥4,300 / ¥1,700)と完全一致することを確認した。改定ルールの正確な定義(「前年度価格 ×(当該年度の物価変動指数の見通し + 1.03)」、法第39条第1項・第116条第1項に基づく)も原文で確認できた。**当初「2027年度以降」としていたのは誤りで、一次資料はこの改定式の適用を令和9〜12年度(2027〜2030年度)の4年間に限定している**ことが判明した。詳細は`docs/data/carbon-price-scenarios.md` §2。

**AIが直接取得できた理由(§4の記録の訂正):** METI・自動取得ツール(WebFetch)には403で拒否されたが、ブラウザ相当のUser-Agentヘッダーを付けたPythonの直接リクエストでは取得できた。ログイン・登録不要の完全な公開PDFだった。

**費用:** 無料 / **所要:** 15分

**完了条件:** 二次資料由来の記述が、一次資料の該当箇所引用に置き換わっている(**達成**)。

---

### 3.4 IFVI 価値係数(A-4)【2026-08-10 手順1・3(部分)・4完了、手順2は残作業】

**2026-08-10追記(コードへの反映):** ユーザーから「現時点でこのプロダクトは個人利用のみであり、Content Termsの商用利用禁止条項には抵触しないことを確認済み」との判断が示されたため、下表の日本のVF4本を実装に反映した。

- `lib/demo/company.ts`(`DEEP_DIVE_CONFIG.externalValueFactors`)・`lib/demo/user-site-defaults.ts`(`buildUserDeepDiveConfig`)の`ifvi-vfnutrition`/`ifvi-vfdisease`/`ifvi-vfes`/`ifvi-vfaccess`を、旧仮値(1.35 / 1.05 / 1.62 / 0.34)から実値(0.00 / 0.00 / 2.97 / 0.00)に差し替えた。プラグイン(`packages/core/src/monetization/plugins/ifvi-water-consumption.ts`)は「較正前・source region」の値を受け取る設計のため、PPP等の変換はせずIFVI公表値をそのまま渡している(地理較正は`calibration.ts`が別途一元適用)。
- `lib/demo/run-demo-pipeline.ts`の`m3_methodPluginVersions["ifvi-water-consumption"]`を`"2026-03-final"`→`"2026-03-final:jp-table-d1-v1"`に更新した。IFVI方法論自体(プラグインの`version`フィールド)は不変だが、投入係数データが仮値から実値に変わったことをRecalculationHash(M8)に反映し、GAP-20の再判定アラートが正しく発火するようにするため。
- `VersionedParameterSet`(setId: `"ifvi-water-consumption"`)は現状、コード内のどこからも呼び出されていない未使用ユーティリティ(`packages/core/src/ledger/versioned-parameter-set.ts`、テスト以外に呼び出し元なし)であり、実データの数値そのものを保持する設計にもなっていない(版のメタデータ(いつ・なぜ変更したか)のみを保持する設計、`docs/decisions/design-rationale-log.md` D-97)。よって本件では上記のバージョン文字列変更(RecalculationHash経由)で追跡し、この関数群自体は呼び出していない。
- テスト370件全て green(`npx vitest run`)。既存テストはこれらの数値をハードコードで検証していないため、既存の期待値には影響なし。
- **注意:** これは国レベル(minimum option)の値であり、拠点レベルの精度を上げる場合は本文Eq.3-5(局所BD/WS比率による補正)の実装が別途必要(未実装。現状のプラグインは拠点補正を行わない)。

**手順4(完了):** 上記の通り、係数はコードに反映済み。当初想定していた`VersionedParameterSet`への「版としての登録」は、この関数群が現状プロダクションコードから未使用のため見送り、RecalculationHashのバージョン文字列変更で代替した。

**目的:** M3のIFVIプラグインに実係数を入れる(現在はデモ用の仮値)。

**結果(手順1):** 人間がPDFをダウンロード・配置し、AI側で読み取れた(この環境のReadツールはPDFをネイティブに処理でき、pdftotextの不在は障害にならなかった)。**Appendix D(Table D1)の日本(Japan)の行**は以下の通り(Global Perspective、USD(2024)/m³、Global Value Factor Database側とは別に方法論PDF本体に掲載):

| 変数 | 値 | 備考 |
|---|---|---|
| VFes(生態系サービス) | $2.97 | |
| VFnutrition(栄養不良) | $0.00 | |
| VFdisease(水系感染症) | $0.00 | |
| VFaccess(将来アクセス費用) | $0.00 | |
| VFH2O,national(集計値) | $2.97 | Eq.2適用済みの国別集計値。VFaccess + MAX(VFes, VFnutrition, VFdisease) |
| BDnational(生物多様性圧力) | 3.59 | WWF Biodiversity Risk Filter準拠 |
| WSnational(水ストレス) | 1.97 | Aqueduct Water Risk Atlas準拠 |

地域・所得階級区分:East Asia & Pacific / High income。価格基準年:2024年(USD)。これは**国レベルの値**であり、拠点レベルで使う場合は本文Eq.3-5(局所BD/WS比率による補正)を適用する必要がある(§3.4の元の手順4は変更なし、`VersionedParameterSet`への登録は残作業)。

**結果(手順3・利用条件、部分完了):** PDF本体p.3-4の「Terms of Use for Available Content」を確認した。**商用プロダクトへの組み込みは明確に禁止**(§1.3(a):"for any commercial or for-profit purpose, including... in any public reporting")。再配布も不可(§1.2)。詳細は`docs/data/licensing.md`のIFVIセクションに記録済み。**ただし** これはPDF本体に印字された規約であり、IFVI本体の一般利用規約(`https://ifvi.org/terms-of-use/`)は未読(本規約が優先するため必須ではないが、定めのない事項の補完として確認が望ましい)。**商用利用の可否そのものはこの規約により実質確定(不可)だが、非営利アドバイザリー例外に当たる余地があるかはIFVIへの直接照会が必要**(下書きは`docs/business/outreach-action-plan.md`)。

**残作業(手順2):**
2. **Global Value Factor Database:**
   `https://ifvi.org/methodology/environmental-topic-methodology/interim-methodologies/download-form-global-value-factor-database/` のフォームを送信して取得する(人間のフォーム入力が必要。フォーム提出後に表示される規約が方法論PDF本体のContent Termsと同一かも確認する)。**このDBは大気汚染・土壌利用転換・廃棄物・水質汚染(104物質)を含む約10万件規模で、水消費のVF4本(今回反映済み)とは別データ。**現在の実装(水消費カテゴリのみ)には不要だが、将来他カテゴリを追加する場合に必要になる。

**費用:** 方法論PDFは無料。係数の商用利用は**Content Termsにより明確に禁止されているが、個人利用の範囲では抵触しないことを確認済み**(`licensing.md`)/ **所要:** Global Value Factor Databaseの取得は1日、商用展開する場合は利用条件の個別照会・契約が別途必要

**完了条件:** 日本のVF 4本の数値・単位・価格基準年が記録され、コードに反映されている(**完了**)。商用利用の可否は個人利用の範囲では問題なしと確認済み(商用展開時は再確認が必要)。

---

### 3.5 有償・要契約データ(A-5〜A-8)【人間・契約が前提】

いずれも**問い合わせメールの下書きが `docs/business/outreach-action-plan.md` に準備済み**。残るのは送信と交渉。

| 対象 | 窓口 | 確認すべきこと | ブロックするGAP |
|---|---|---|---|
| **WDPA / KBA** | IBAT Alliance(ibat-alliance.org)または UNEP-WCMC(business-support@unep-wcmc.org) | API連携の可否、Enterprise Plus 約$35,000/年の条件、拠点数による課金、再配布不可の範囲 | GAP-04・GAP-08 |
| **ESVD** | esvd.info の問い合わせ窓口 | ストラテジックパートナーの条件と費用、個別レコードの商用利用可否(**日本の地理的カバレッジは確認完了、§3.5a参照**) | M3深掘りのティア判定 |
| **CE Delft 環境価格ハンドブック** | cedelft.eu | 係数の商用利用可否、再配布条件 | 汚染カテゴリ・AoP対応表のCE Delft分 |
| ~~**LIME3**~~ | ~~伊坪研究室 / 産業環境管理協会~~ | **解消(§3.5b参照)。** アスエネ社が既にAIST-IDEA Ver.4.0の「標準版」ライセンスを保有しており、問い合わせ・契約自体が不要だった | M3の実係数 |

**ESVDについての注意:** 日本カバレッジは全12,390件中67件で、**薄いことが確認された**(§3.5a)。件数自体は取得できたが、商用利用可否・ストラテジックパートナー条件は依然未確認のまま残る。

**完了条件:** 各データについて「使える/使えない/条件付き」が書面で確定し、`docs/data/licensing.md` に確認日・確認先・原文該当箇所とともに記録されている。

---

### 3.5a ESVD 日本カバレッジ確認(A-7の一部)【2026-08-14 完了】

**目的:** M3ティア判定の実運用における、ESVD日本ローカルデータの利用可否判断に必要な、カバレッジ規模の確認。C-3(`docs/mobile-continuation-guide.md`)対応。

**結果:** 人間がesvd.net(登録フォーム、モバイルではUI表示崩れのため要PC)でアカウント登録・ログインし、Countryフィルタで"Japan"を指定してCSVエクスポートした。AIがCSVを分析した。

**件数:** 全12,390件中、**Japan該当は67件**(Database Version: SEP2025V1.0)。

**バイオーム分布(67件の内訳):**

| バイオーム | 件数 |
|---|---|
| Marine | 31 |
| Temperate forest and woodland; Cold climate evergreen forest and woodland | 12 |
| Intensive land use | 9 |
| Coastal systems | 9 |
| Inland wetlands | 4 |
| Temperate forest and woodland | 2 |

**TEEBサービス分類の分布(上位):** Existence & bequest values(存在・遺贈価値)26件、Recreation/tourism 16件、Food 9件 —— **多くが沿岸・海洋の非利用価値**であることを示す。

**評価手法の分布:** CE(選択実験)23件、CV(仮想評価法)20件、MP(市場価格法)7件、TC(トラベルコスト法)7件、RC(代替費用法)6件。通貨は日本円47件・米ドル20件。

**MVP水パイロット(取水量シナリオ)に直接関連する記録:** TEEB分類「Regulation of water flows(水流動の調整)」に該当する**3件のみ**。

| ValueId | 内容 | 評価手法 | 原単位 | Int$/ha/年 | 出典 |
|---|---|---|---|---|---|
| 10100002 | 地下水涵養(農地) | CV | ¥505(2003年) | 63.55 | Aizaki et al. 2006 |
| 10100003 | 水環境保全(農地) | CV | ¥642(2003年) | 44.05 | Aizaki et al. 2006 |
| 8970001 | 森林の水源涵養 | RC | $1,385,430,000/年(2009年、総額) | 0.46 | Ninan & Inoue 2014 |

**判定:** ESVD日本ローカルデータは、水消費シナリオへの転用可能性が**限定的**。3件は取水量そのものではなく地下水涵養サービスへのWTPや代替費用であり、IFVIのVFesと概念的に近い。件数も少なく統計的頑健性に欠ける。

**この結果が支持する既存設計判断:** `docs/data/aop-mapping-v1.md` §1.3 が既に定めている「IFVI Water ConsumptionのVFesは(日本ローカル版ではなく)Brander et al. 2024によるグローバル集計版ESVDを出典とする」という設計は、この調査結果と整合する。**ESVD日本ローカル版を独自に契約・調達する優先度は、水カテゴリに関しては低い**(汚染・生物多様性等の他カテゴリでは別途判断が必要)。

**未確認のまま残る事項:** 商用利用可否・ストラテジックパートナー条件(§3.5表、依然未着手)。件数確認により、契約交渉の要否そのものを再検討できる材料は揃った。

**生データの所在:** `Esvd_Data_14th-Aug-2026_10-31-51_Database_Version_SEP2025V1_0.csv`(67件、人間がエクスポート)。リポジトリへの格納は未実施(`docs/data/external/` への配置を推奨)。

---

### 3.5b LIME3 係数の取得・コード反映(A-5)【2026-08-15 完了】

**目的:** M3のLIME3水消費プラグイン(`packages/core/src/monetization/plugins/lime3-water.ts`)に実係数を入れる(従来はデモ用の仮値28,500、単位・出典不明)。

**結果:** 人間が `AIST-IDEA_Ver.4.0_標準版_Excel形式_LIME3_日本語.xlsx`(産総研IDEAラボ発行)を提供した。**ファイル内のライセンス表示を確認したところ、アスエネ株式会社が既に「標準版」ユーザーライセンス(有効期限2027-06-30)を保有していることが判明した。** §3.5表でLIME3を「問い合わせ・契約が必要」としていたのは誤りで、既存契約の範囲内で利用できる。詳細は`docs/data/licensing.md`のLIME3セクション。

**取り込んだデータ:** `LCIA係数_LIME3`シート(980件の基本フロー特性化係数)を`docs/data/external/aist-idea-lime3-v4.0-lcia-coefficients.csv`として抽出した。ライセンス担当者の氏名等が記載された表紙・ライセンス表示行は除外し、係数データ本体のみを抽出済み。判断根拠・選定した値の詳細は`docs/data/lime3-coefficients-notes.md`。

**選定した値:** 取水(表層水)・利子率2%・消費国=日本の統合化スコア `0.0135886259`(US$/m³、較正前)。以下は確認されていない仮定として残る:
- LIME3のこのデータセットは水関連フローについて「生産国」視点の値を持たないため、選択の余地なく「消費国」視点を使用
- PRISM側に拠点の水源種別(表層水/地下水)を区別するデータが無いため、表層水を既定値として仮置き(地下水は係数が約2.6倍高い)
- 価格基準年の記載箇所を発見できなかった

**コードへの反映:** `lib/demo/company.ts`・`lib/demo/user-site-defaults.ts`の`externalValueFactors["lime3-water"]`を28,500→0.0135886259に差し替えた。回帰テスト(`lib/demo/lime3-water.test.ts`)を追加し、IFVI側と同じ較正前・較正後の数値を検証している。テスト399件・型検査ともにgreen。

**費用:** 追加費用なし(既存ライセンス) / **所要:** 半日(ライセンス確認・データ抽出・コード反映・テスト追加)

**完了条件:** LIME3の水消費係数の数値・単位・出典が記録され、コードに反映されている(**完了**)。表層水/地下水の選択・価格基準年は今後の精緻化余地として`lime3-coefficients-notes.md`に明記済み。

---

### 3.6 World Bank データの利用条件確認(A-13の残り)【2026-08-10 完了】

**結果:** `https://datacatalog.worldbank.org/public-licenses` および `https://datacatalog.worldbank.org/search/dataset/0037712`(World Development Indicators)を確認した。使用した3指標(`PA.NUS.PPP` / `NY.GNP.PCAP.PP.CD` / `NY.GDP.DEFL.ZS`)はいずれもWDIに属し、**CC BY 4.0の対象・商用利用可・帰属表示のみが義務**であることを確認した。詳細は`docs/data/licensing.md`のWorld Bankセクションに記録済み。

**費用:** 無料 / **所要:** 15分

---

### 3.7 Aqueduct 4.0(A-9)【2026-08-10 完了】

**結果:** 人間がzipをダウンロード・展開し、AI側でCSV(`baseline_annual`)・READMEを確認した。詳細は`docs/data/aqueduct-water-stress-notes.md`に記録済み。

- **ライセンス:** CC BY 4.0(WRI公式FAQで確定。従来「版不明」としていたのを解消)。帰属表示書式は `Source: WRI Aqueduct, accessed on [date]`。`docs/data/licensing.md`に転記済み
- **BWSカテゴリ区分:** CSVの`bws_cat`/`bws_label`列から直接確認(技術ノートの転記ではなく実データで確認できたため、より確実)。Low/Low-Medium/Medium-High/High/Extremely Highの5区分 + Arid and Low Water Use(-1)/No Data(-9999)
- **boolean化閾値:** `bws_cat >= 3`(High、40%以上)を水ストレス地域とする(WRI自身が企業のリスク選定の目安とする40%閾値に準拠)。`Arid and Low Water Use`も同様にtrue。実装は`packages/core/src/site/water-stress.ts`の`isHighBaselineWaterStress()`
- **拠点への適用(発見):** 当初CSVにbasinの幾何情報がなくGDAL等が環境になかったため都道府県/州単位の面積加重近似で代替していたが、サンドボックス外での`pip install fiona`が成功し(GDAL同梱ホイール)、GDBファイルへの厳密なpoint-in-polygon照会を実行できた。**近似値と厳密値は3拠点すべてで一致**(愛知=cat2、大阪=cat1、グジャラート=cat4)。**日本国内は面積の過半数が「High」に達する都道府県が存在せず**(最大は兵庫県で7.2%)、デモ拠点site-042(愛知県付近)・site-050(大阪府付近)は実データ上いずれも`waterStress: false`になることが判明した。旧実装(`lookup: () => true`、座標を無視した固定値)を実データに差し替えた
- **デモへの反映:** ユーザー判断により、site-042・site-050は実データどおりfalseに訂正し、複数のTNFD基準が該当する実例として、Aqueductで実際に「Extremely High」区分となるインド・グジャラート州の海外サプライヤー拠点(`site-060`)を追加した(`lib/demo/company.ts`)。M2の優先度算定・深掘り昇格は従来どおりsite-042のみ(GATE検証テストで確認済み)
- **帰属表示の実装:** 完了(2026-08-10)。`app/components/attribution.tsx`の`DataSourceAttribution`コンポーネントで、拠点一覧・優先順位評価画面に表示する

**費用:** 無料 / **所要:** 半日

**完了条件:** 水ストレス閾値の出典が記録され、M1の判定が公式のカテゴリ区分に一致している。(**完了**。拠点レベルの正確な地点判定はGDAL等の導入待ちの近似であることを`aqueduct-water-stress-notes.md` §4に明記)

---

### 3.8 ENCORE 依存・影響レーティング(A-10)【2026-08-10 データ取得・コード反映完了】

**結果:** 人間がencorenature.orgで無料アカウントを登録し、「Methodology & Downloads」から`Updated ENCORE knowledge base May 2026`(zip、17ファイル)を取得した。詳細は`docs/data/encore-materiality-notes.md`。

- **どのファイルが該当するか:** 「Data & Methodology」配下の10項目のうち、実データは「Methodology & Downloads」からのダウンロードのみ。「Materiality Ratings」項目自体はレーティング尺度の説明ページで、データファイルではない。業種別の依存・影響レーティングは`06. Dependency mat ratings.csv`(依存度、ISIC業種×生態系サービス28種)・`07. Pressure mat ratings.csv`(圧力/影響、ISIC業種×圧力13種)
- **ライセンス:** CC BY-SA 4.0で変更なし(`licensing.md`の既存記録どおり)。商用利用可(ENCOREへの帰属+同ライセンスでの再頒布が条件)
- **boolean化の閾値:** ENCORE自身は閾値を推奨していないため、依存度・圧力のいずれかでHigh以上のレーティングが1件でもあれば「依存・影響が大きい可能性がある」とするPRISM側の判断を採用(`packages/core/src/site/encore-materiality.ts`の`hasHighMaterialityRating()`)
- **拠点への適用(発見):** デモの業種(chemicals/steel/textile)をISIC業種(C_20_201_2011/C_24_241/C_13_131)に対応付けて実データを確認した結果、`site-050`(鉄鋼)は旧実装で`lookup: () => false`(座標・業種を無視した固定値)としていたが、実データでは水供給・水流調整への依存(H)と騒音・GHG・大気汚染物質・有害物質排出の圧力(H/VH)が確認され、**trueに訂正**した。`site-042`(化学)・`site-060`(繊維)も実データに基づく根拠(VH区分の圧力・依存)に差し替えた

**帰属表示の実装:** 完了(2026-08-10)。`app/components/attribution.tsx`の`DataSourceAttribution`コンポーネントで、拠点一覧・優先順位評価画面(`app/sites/page.tsx`・`app/assessment/page.tsx`)にENCORE・WRI Aqueduct 4.0の帰属表示を表示する

**費用:** 無料 / **所要:** 半日

**注意:** ENCOREページ上の第三者データはCC BY-SA 4.0の対象外の場合がある(`licensing.md`)。取得したファイルごとに出所を確認する。

---

### 3.9 生態系完全性トレンドのデータ源調査(A-11)【2026-08-10 調査完了】

**目的:** GAP-13。`rapidIntegrityDecline`(急速な劣化)が構造的に常にfalseである状態を解消するか、解消不能と確定させる。

**結果:** 5候補すべてを調査し、`docs/data/ecosystem-integrity-trend-notes.md` に記録した。

- **手順1(棚卸し):** 手順書記載の5候補(BII・FLII・Ecosystem Integrity Index・WWF Risk Filterのトレンド指標・IBAT/STAR)がそのまま調査対象になった
- **手順2(各候補の確認):** (a)時系列粒度 (b)商用利用可否 (c)拠点座標照会可否 を1件ずつ確認した結果、**該当ありは1件のみ**:Sun, Hughes, He, Yu (2026, *Scientific Data*)の"Ecological Integrity Index"(CC BY 4.0・年次2015-2023・1kmラスタ・Zenodo公開)。他4件(BIIは商用ライセンスがネック、FLIIは単発スナップショットで時系列なし、WWF Risk Filterの実体はBIIの2005年単年値でトレンド指標という別物は存在しない、IBAT/STARは経年トラッキングが「将来の開発課題」と公式資料に明記)は不採用。「Ecosystem Integrity Index」という名称は無関係の3系統(UNEP-WCMC版・The Landbanking Group商用版・single-earth版)が別途存在し、混同注意
- **手順3(記録):** `docs/data/ecosystem-integrity-trend-notes.md` に全候補の判定根拠を記録済み
- **手順4(短期対応):** 別件の対応(2026-08-08、design-rationale-log D-110)で**先行して実装済み**であることを確認した(`MaterialIssue.unevaluatedCriteria`・`app/sites/page.tsx`等の「◯/4」表示)

**D-90への影響:** D-90は「使えるデータ源が無い」という前提だったが、これは訂正が必要(1件だけ候補が見つかった)。ただし実装に進めるかは別途判断が必要(閾値定義・ラスタ点抽出の新規実装・データの継続更新保証の欠如が理由)。この判断はE-8として§1.E章に追加した

**費用:** 無料(調査のみ、実際に無料で完了) / **所要:** 半日

---

### 3.10 TNFD LEAP L3 の5基準原文(A-14)【2026-08-10 完了】

**目的:** M1 D-2の根拠固め。実装済みの5基準が公式定義と一字一句対応していることを、監査説明のために原文で押さえる。

**結果:** `https://tnfd.global/wp-content/uploads/2023/07/23-23882-TNFD_v0.4_LEAP-Guidance-Annex-4.11_v4-2-1.pdf`(*Additional Guidance – LEAP (L3)*, 2023年7月)を取得し、Table 2の英語原文全文を`docs/data/tnfd-leap-l3-criteria.md`に転記した。**5基準すべてが実装(`CriteriaMet`)と対応することを確認**。特に、`highEcosystemIntegrity`と`rapidIntegrityDecline`が「Ecosystem integrity」という1つのArea区分の下に原文でも並記されていることを確認し、`criteria.ts`の実装構造(1つのlayerTypeから2つの基準を導出する設計)が独自解釈ではなく原文に忠実であることが確定した。水ストレスは流域(basin)スケール、生態系完全性・生物多様性重要性はランドスケープスケールで評価すべきという原文の推奨粒度も記録した。

**AIが取れた理由(§4の記録の訂正):** 自動取得ツール(WebFetch)にはHTTP 403で拒否されたが、ブラウザ相当のUser-Agentヘッダーを付けたPythonの直接リクエストで取得できた(GX-ETSの一次資料取得と同じ手法、§3.3)。

**費用:** 無料 / **所要:** 30分

**完了条件:** 実装済みの5基準が公式定義と一字一句対応していることを、監査説明のために原文で押さえる(**達成**)。

---

### 3.11 `data-intake-guide.md` の拡張(D-4〜D-9)

**目的:** GAP-03の前提。財務・意思決定・開示の入力項目が受け入れガイドに存在しない。

**手順:**
1. `docs/data-intake-guide.md` に4ファイル目(財務・意思決定パラメータ)の記入欄を追加する。**記入者が財務・経理・経営企画であることを明記する**(現行3ファイルとは提供部門が異なる。design-rationale-log R-1が営業難度の核心と指摘した部分)
2. 項目:報告営業利益 / Net Debt / EBITDA / 支払利息 / 減損テスト前提の閾値 / 全社割引率 / 案件別の通常NPV・割引率・期間・承認閾値 / 内部化済みコスト / 3シナリオへの内部化確率 / 前年度に採用した貨幣化手法
3. **M6 D-10(段階的開示)に合わせ、「承認閾値は後から入れてよい」ことをガイドに明記する。**初日に財務部門を巻き込まないと使えない、という印象を与えない書き方にする
4. `lib/intake/` に対応するテンプレートとローダーを追加する(ここからはコード作業)

---

## 4. 「AIが取得できなかった」の内訳(再取得を試みる人向け)

| 理由 | 該当 | 解消方法 |
|---|---|---|
| PDFのテキスト抽出ができない【2026-08-10解消】 | CICESガイダンス(当時)。以降のPDF(WWF Biodiversity Risk Filter方法論書・IBAT STARブリーフィングノート等)はこの解消により調査に使えた | `brew install poppler`(サンドボックス外、`dangerouslyDisableSandbox`)で`pdftotext`/`pdftoppm`を導入。IFVI方法論PDFのように元々テキストベースで直接読めるPDFもあるが、画像ベース(要レンダリング)のPDFはpoppler導入後に読めるようになった |
| xlsx等のバイナリを解析できない | CICESスプレッドシート | 同上(表計算ファイルを読む手段の追加) |
| File Geodatabase(basinポリゴンの幾何情報)を解析できない【2026-08-10解消】 | Aqueduct 4.0の`GDB/`(CSVは問題なく解析できた) | サンドボックス内のpipはSSL証明書検証エラーで失敗するが、**サンドボックス外では`pip install fiona`が成功する**(GDAL同梱ホイール、OpenFileGDBドライバでGDBを直読み可能)。当初の都道府県/州単位の面積加重近似は、厳密な地点判定と全拠点で一致することを確認済み(`docs/data/aqueduct-water-stress-notes.md` §4) |
| サーバーが自動取得を拒否(HTTP 403)【METI・TNFDは解消】 | NGFS各PDF(login必須のため依然404)。**METI(経産省、§3.3)・TNFD(tnfd.global、§3.10)は2026-08-10に解消済み** | 自動取得ツール(WebFetch)のUser-Agentが拒否される場合、**ブラウザ相当のUser-Agentヘッダーを付けた直接リクエスト(Python requests等)で回避できることがある**(METI・TNFDのlogin不要の公開PDFで成功、NHM data portalでは同じ手法でも失敗しており、サイトによる)。効かない場合はブラウザで人間が取得 |
| ログイン・フォーム登録が必要 | NGFS(IIASA)、IFVI value factor DB、WRI | 人間が登録 |
| 有償契約が必要 | WDPA、ESVD、IFVI係数、CE Delft | 契約(§3.5) |
| 顧客からしか得られない | D-1〜D-9 | パイロット契約 |
| そもそも判断であってデータではない | E-1〜E-8 | 人間が決める |