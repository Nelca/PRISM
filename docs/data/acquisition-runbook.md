# コード実装以外に必要なものの一覧と取得手順書

**目的:** `docs/requirements/mvp-completion-gap.md` のGAPを埋めるために、**コードを書く以外に**必要なもの(外部データ・契約・アカウント・顧客提供データ・人間の判断)を網羅し、取得手順を定める。
**参照元:** `docs/requirements/mvp-completion-gap.md`、`docs/data/licensing.md`、`docs/business/outreach-action-plan.md`
**最終更新:** 2026-08-08

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
| A-3 | GX-ETS 価格の一次資料 | 人間 | 二次資料一致のみ(§3.3) | GAP-11 |
| A-4 | IFVI 価値係数(水消費の国別4本 + Global Value Factor DB) | 人間 | 未取得(§3.4) | M3の実係数 / GAP-14 |
| A-5 | LIME3 係数 | 人間 | 未取得(§3.5) | M3の実係数 |
| A-6 | CE Delft 環境価格ハンドブック | 人間 | 未取得(§3.5) | 汚染カテゴリ / AoP対応表のCE Delft分 |
| A-7 | ESVD 個別レコード + 日本カバレッジ | 人間 | 未取得(§3.5) | M3ティア判定の実運用 |
| A-8 | WDPA / KBA レイヤ | 人間 | 未取得(§3.5) | GAP-04 / GAP-08 |
| A-9 | Aqueduct 4.0 水ストレス | AI可(要フォーム) | 未取得(§3.7) | GAP-04 |
| A-10 | ENCORE 依存・影響レーティング | AI可 | 未取得(§3.8) | GAP-04 |
| A-11 | 生態系完全性トレンドのデータ源 | AI可(調査) | 未着手(§3.9) | GAP-13 |
| A-12 | 炭素の社会的費用 | AI可 | **取得済**(§2.4) | GAP-14 |
| A-13 | 地理較正パラメータ(PPP・所得・デフレータ・η・相対価格) | AI可 | **取得済**(§2.2・§2.3) | M3 §3.2の監査要件 |
| A-14 | TNFD LEAP L3 の5基準原文 | 人間 | 未取得(§3.10) | M1 D-2の根拠固め |
| A-15 | SSBJ基準本文 | 人間 | 未着手 | GAP-19(フェーズ2) |

### B. 契約・許諾 —— **すべて人間。AIでは代替不能**

| # | 相手 | 内容 | 概算費用 | ブロックするGAP |
|---|---|---|---|---|
| B-1 | IBAT Alliance / UNEP-WCMC | WDPA商用ライセンス | Enterprise Plus 約 $35,000/年(API連携時) | GAP-04・GAP-08 |
| B-2 | ESVD(Foundation for Sustainable Development等) | 商用利用=ストラテジックパートナー化 | 未確認 | M3の深掘りティア判定 |
| B-3 | IFVI | 価値係数の商用利用ライセンス | 未確認(有償と明記) | M3の実係数 |
| B-4 | CE Delft | 係数の商用利用 | 未確認 | 汚染カテゴリ |
| B-5 | LIME3(伊坪研究室 / 産業環境管理協会) | 係数の利用条件 | 未確認 | M3の実係数 |
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
| **A-2 + A-3** | NGFS価格軌道・GX-ETS一次資料 | **GAP-11(シナリオ差の数値化)** | 価格を推定で置くことは D-15 に直接抵触する。**現在の「ラベルのみ」実装を維持するのが正しい** |
| **B-1** | WDPA/IBAT契約 | GAP-04のうち **WDPA/KBAアダプタの実装** | データが手元に無い以上、照会コードを書いても動かせない。ただしGAP-08(ゲーティング)は逆に**契約前にこそ必要**(下記) |
| **D-4〜D-9** | 顧客の財務・意思決定・開示データ | **実データでの**GAP-03検証、build-plan §7.1のGATE | 入力UI(コード)は先に書けるが、通すデータが無い |

### 1.8.2 軟ブロック(実装は進む。実データ通しだけが通らない)

| # | 項目 | 進められること | 到着後に差し替わるもの |
|---|---|---|---|
| A-4 / A-5 / A-6 / A-7 | IFVI・LIME3・CE Delft・ESVDの係数 | **プラグイン構造は既に完成している**(M3 D-3)。係数は `VersionedParameterSet` の差し替えで入る | 係数の実値。現在はデモ用の仮値 |
| A-9 | Aqueduct 水ストレス | 注入口は実装済み。閾値でのboolean化は呼び出し側の責務(`criteria.ts`) | 公式カテゴリ区分による判定閾値 |
| A-11 | 生態系完全性トレンド | **GAP-13の短期対応(「5基準中4基準で評価」表示)は今すぐ実装できる** | `rapidIntegrityDecline` の実判定(該当データ源が無ければ恒久的に無し) |
| B-2〜B-5 | ESVD・IFVI・CE Delft・LIME3 の契約 | 上と同じ。**構造は契約に依存しない** | 商用利用可否。不可なら `licenseMode` を変えてゲーティング(GAP-08)で止める |
| D-1〜D-3 | 顧客の拠点・調査・物理量 | 取込UI(GAP-02)はテンプレート仕様が確定済みなので先に書ける | 実データ |

**重要な非対称性:** `B-1〜B-5(契約)`は**GAP-08(ライセンスゲーティング)をブロックしない。むしろ契約が無い今こそGAP-08が必要である。**現状は契約前のWDPAデータが感応度スコアに算入されており、仕様(M8 D-4)と逆の挙動をしている。**契約を待つ理由がない、優先度の高い実装。**

### 1.8.3 非ブロック(実装と独立)

| # | 項目 | 位置づけ |
|---|---|---|
| A-1の残り | CICES公式スプレッドシート | MVPで付与するCICESコードはESVDレコードの記載を転記するのみで、PRISM側で階層表を引かない(`cices-v51-notes.md` §3)。**独自にコードを割り当てる必要が生じた時点で硬ブロックに変わる** |
| A-10 | ENCORE帰属表示 | 無料・CC BY-SA・契約不要。**今すぐ実装できる義務**であり、待つ理由がない |
| A-14 | TNFD LEAP L3 原文 | 実装は既にある。監査説明の根拠を後追いするだけ |
| A-15 | SSBJ基準本文 | GAP-19(フェーズ2) |
| E-5 / E-6 / E-7 | η の採用値 / CICES版 / 相対価格のカテゴリ別 | **既定値のまま実装を進めてよい。**採用値と理由をAssumptionEntryに記録できていれば、後から版を切って変更できる(M8 D-3) |
| F-1 | LOI・支払意思ヒアリング | 実装と独立。ただし**構想書10.7の継続条件**であり、事業判断としては最上位 |
| §3.6 | World Bank利用条件の確認 | 帰属表示の書式が決まるだけ |

### 1.8.4 取得済みデータが解除したブロック(2026-08-08時点)

| 取得したもの | 解除されたもの |
|---|---|
| 地理較正パラメータ(§2.2・§2.3) | M3 §3.2の監査要件1・2(PPP出典の明記・ηの根拠文献)を**満たせる状態になった。**実装は仮値のままなので、差し替えは残作業 |
| CICES階層・コード体系(§2.1) | M4 §6.3の前方一致実装の前提が**根拠付きになった**(従来は根拠文書ゼロで `cicesMatchLevel: "group"` が動いていた) |
| 炭素の社会的費用 236 USD/tCO2(§2.4) | E-1で気候カテゴリを選ぶ場合の**厚生価値側の係数が確保済み。**交換価値側(GX-ETS)は硬ブロックのまま |

### 1.8.5 着手順(`mvp-completion-gap.md` §6)との対応

| 波 | 硬ブロックの有無 |
|---|---|
| 第1波(GAP-17 / 01 / 15 / 16) | GAP-17(ティア読み替えの削除)は**ブロックなし・今すぐ着手可**。残りは **E-2 → C-4** が解けるまで着手不可 |
| 第2波(GAP-02 / 03 / 08 / 13) | **GAP-08・13 はブロックなし・今すぐ着手可。**GAP-02・03 はUI実装まで可、実データ検証は D-1〜D-9 待ち |
| 第3波(GAP-06 / 07 / 09 / 12) | GAP-06・09 はブロックなし。GAP-07・12 は C-4(永続化)待ち |
| 第4波(GAP-10 / 05 / 11) | GAP-10 はブロックなし。**GAP-05 は E-3+C-5+B-6 待ち、GAP-11 は A-2+A-3 待ちで、いずれも硬ブロック** |

**結論:GAP-17・08・13・06・09・10 と ENCORE帰属表示(A-10)は、外部データ・契約・判断のいずれも待たずに今すぐ着手できる。**それ以外はまず **E-2(永続化の選択)** を決めるのが、最も広いブロックを外す一手になる。

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

### 2.6 Aqueduct 4.0 の所在

- 直接ダウンロード: `https://files.wri.org/aqueduct/aqueduct-4-0-water-risk-data.zip`
- フォーム経由のダウンロードも用意されている
- ライセンス表記は「Creative Commons」とのみ。**版(CC BY 4.0か等)は未確認**(§3.7)

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

### 3.3 GX-ETS 価格の一次資料(A-3)【人間】

**目的:** GAP-11の日本側。二次資料での値(4,300 / 1,700 円/t-CO2、実質3%/年)を一次資料で確定する。

**手順:**
1. 経済産業省サイトで「産業構造審議会 グリーントランスフォーメーション推進小委員会 排出量取引制度小委員会(第7回)」(2025年12月19日)の配布資料を開く
2. **資料3のPDFをダウンロードし、参考上限取引価格・調整基準取引価格の記載ページを特定する**
3. 「2027年度以降は実質3%ずつ引き上げ」の**正確な定義**を確認する(何を基準にした実質か、参照するインフレ指標は何か、改定の起点年はいつか)
4. `docs/data/carbon-price-scenarios.md` §2 を更新し、資料名・ページ番号・公表日・URLを記録する

**費用:** 無料 / **所要:** 30分

**完了条件:** 二次資料由来の記述が、一次資料の該当ページ引用に置き換わっている。

---

### 3.4 IFVI 価値係数(A-4)【人間】

**目的:** M3のIFVIプラグインに実係数を入れる(現在はデモ用の仮値)。

**手順:**
1. **水消費の国別4本(VFnutrition / VFdisease / VFes / VFaccess):**
   `https://ifvi.org/wp-content/uploads/2026/03/IFVI_VBA_Environmental_Methodology-2_Water-Consumption_FIN_04.pdf` をダウンロードし、**Appendix D(Table D1)の日本(Japan)の行**を転記する。単位と価格基準年を必ず併記する
2. **Global Value Factor Database:**
   `https://ifvi.org/methodology/environmental-topic-methodology/interim-methodologies/download-form-global-value-factor-database/` のフォームを送信して取得する
3. **利用条件の確認(重要):** `https://ifvi.org/terms-of-use/` を確認し、**商用プロダクトへの組み込みと再配布の可否**を書面で確定させる。不明な場合はIFVIに直接照会する(下書きは `docs/business/outreach-action-plan.md`)
4. 取得した係数は `VersionedParameterSet`(setId: "ifvi-water-consumption")として版を切って登録する

**費用:** 方法論PDFは無料。係数の商用利用は**有償ライセンスと明記されている**(`licensing.md`)/ **所要:** 取得は1日、契約は交渉次第

**AIが取れなかった理由:** PDFのテキスト抽出に失敗(圧縮ストリームのまま返る)。ダウンロードフォームは人間の入力が必要。

**完了条件:** 日本のVF 4本の数値・単位・価格基準年が記録され、商用利用の可否が書面で確定している。

---

### 3.5 有償・要契約データ(A-5〜A-8)【人間・契約が前提】

いずれも**問い合わせメールの下書きが `docs/business/outreach-action-plan.md` に準備済み**。残るのは送信と交渉。

| 対象 | 窓口 | 確認すべきこと | ブロックするGAP |
|---|---|---|---|
| **WDPA / KBA** | IBAT Alliance(ibat-alliance.org)または UNEP-WCMC(business-support@unep-wcmc.org) | API連携の可否、Enterprise Plus 約$35,000/年の条件、拠点数による課金、再配布不可の範囲 | GAP-04・GAP-08 |
| **ESVD** | esvd.info の問い合わせ窓口 | ストラテジックパートナーの条件と費用、**日本の地理的カバレッジ(何レコードあるか)**、個別レコードの商用利用可否 | M3深掘りのティア判定 |
| **CE Delft 環境価格ハンドブック** | cedelft.eu | 係数の商用利用可否、再配布条件 | 汚染カテゴリ・AoP対応表のCE Delft分 |
| **LIME3** | 伊坪研究室 / 産業環境管理協会 | 係数セットの入手方法(書籍/データ提供)、商用利用条件、版 | M3の実係数 |

**ESVDについての注意:** 日本カバレッジが薄い場合、構想書11.2 A-4が定める代替(環境省・林野庁の公的評価値への切替)へ進む。**この判定はカバレッジを確認するまで行えない。**

**完了条件:** 各データについて「使える/使えない/条件付き」が書面で確定し、`docs/data/licensing.md` に確認日・確認先・原文該当箇所とともに記録されている。

---

### 3.6 World Bank データの利用条件確認(A-13の残り)

**手順:** `https://datacatalog.worldbank.org/public-licenses` を確認し、使用した3指標(`PA.NUS.PPP` / `NY.GNP.PCAP.PP.CD` / `NY.GDP.DEFL.ZS`)が CC BY 4.0 の対象であることと、要求される帰属表示の書式を `docs/data/licensing.md` に転記する。

**費用:** 無料 / **所要:** 15分

---

### 3.7 Aqueduct 4.0(A-9)

**手順:**
1. `https://files.wri.org/aqueduct/aqueduct-4-0-water-risk-data.zip` をダウンロード(または wri.org のフォーム経由)
2. **ライセンスの版を確定する。**ページ表記は「Creative Commons」のみで版が不明。同梱のLICENSE/READMEまたは技術ノートで CC BY 4.0 かどうかを確認し、帰属表示の書式を `licensing.md` に記録する
3. 技術ノート「Aqueduct 4.0: Updated Decision-Relevant Global Water Risk Indicators」から、**Baseline Water Stress のカテゴリ区分と閾値**を抜く。M1の `waterStress` 基準の判定閾値はこれに従う(独自閾値を発明しない)
4. `NatureInterface.rawResult` に入れる形(boolean化するか数値のまま持つか)を決める。`criteria.ts` は数値なら「0より大きければ充足」という構造的既定を使うため、**閾値でのboolean化は呼び出し側の責務**である

**費用:** 無料 / **所要:** 半日

**完了条件:** 水ストレス閾値の出典が記録され、M1の判定が公式のカテゴリ区分に一致している。

---

### 3.8 ENCORE 依存・影響レーティング(A-10)

**手順:**
1. encorenature.org の Data & Methodology 配下から、業種別の依存・影響レーティングのデータファイルを取得する(CC BY-SA 4.0。商用利用可)
2. **帰属表示を実装する**(M1 D-4で「無条件の義務」と確定済み・低コスト)。書式は `licensing.md` に記載のもの:
   > ENCORE Partners (Global Canopy, UNEP FI, and UNEP-WCMC) (year). ENCORE: Exploring Natural Capital Opportunities, Risks and Exposure. [On-line], [month/year], Cambridge, UK: the ENCORE Partners. Available at: https://encorenature.org.
3. ENCOREデータを参照する画面(拠点一覧・評価画面)とドキュメントに表示する

**費用:** 無料 / **所要:** 半日(帰属表示の実装込み)

**注意:** ENCOREページ上の第三者データはCC BY-SA 4.0の対象外の場合がある(`licensing.md`)。取得したファイルごとに出所を確認する。

---

### 3.9 生態系完全性トレンドのデータ源調査(A-11)

**目的:** GAP-13。`rapidIntegrityDecline`(急速な劣化)が構造的に常にfalseである状態を解消するか、解消不能と確定させる。

**手順:**
1. 候補データ源を棚卸しする。時系列(トレンド)を持つ生態系完全性指標が対象:
   - Biodiversity Intactness Index(BII)
   - Forest Landscape Integrity Index
   - Ecosystem Integrity Index
   - WWF Biodiversity Risk Filter のトレンド指標
   - IBAT/STAR系の経年データ
2. 各候補について、(a)時系列で「急速な劣化」を判定できる粒度があるか (b)商用利用可能か (c)拠点座標で照会できるか を確認する
3. 結果を `docs/data/` に記録する。**該当なしなら「該当なし」と記録する。**これはM1 D-2の5基準のうち1つが恒久的に評価不能であることの根拠資料になる
4. いずれにせよ、GAP-13の短期対応(「5基準中4基準で評価しています」という表示)は実装する

**費用:** 無料(調査のみ) / **所要:** 1日

---

### 3.10 TNFD LEAP L3 の5基準原文(A-14)

**目的:** M1 D-2の根拠固め。実装済みの5基準が公式定義と一字一句対応していることを、監査説明のために原文で押さえる。

**手順:** TNFD "Additional Guidance on the assessment of nature-related issues: the LEAP approach"(2023年3月)のPDFを tnfd.global から入手し、L3(優先地点の特定)の基準の**英語原文と該当ページ**を `docs/data/` に転記する。

**AIが取れなかった理由:** tnfd.global の出版物ページが HTTP 403 を返した。

**費用:** 無料 / **所要:** 30分

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
| PDFのテキスト抽出ができない | CICESガイダンス、IFVI方法論 | **ローカルに `poppler`(pdftotext)を入れれば、以降はAI側で処理できる。**現状この環境にはない |
| xlsx等のバイナリを解析できない | CICESスプレッドシート、Aqueduct | 同上(表計算ファイルを読む手段の追加) |
| サーバーが自動取得を拒否(HTTP 403) | NGFS各PDF、TNFD出版物ページ | ブラウザで人間が取得 |
| ログイン・フォーム登録が必要 | NGFS(IIASA)、IFVI value factor DB、WRI | 人間が登録 |
| 有償契約が必要 | WDPA、ESVD、IFVI係数、CE Delft、LIME3 | 契約(§3.5) |
| 顧客からしか得られない | D-1〜D-9 | パイロット契約 |
| そもそも判断であってデータではない | E-1〜E-7 | 人間が決める |
