# 算定対象拡大のデータ・係数取得手順書

**対象:** PRTR汚染、廃棄物、土地利用・土地改変
**最終更新:** 2026-08-29（LIME3第1手法と3カテゴリ取込の実装状況を反映）
**関連:** `docs/decisions/0004-category-expansion-scope.md`、`docs/roadmap/category-expansion-directive.md`、`docs/data/licensing.md`

---

## 0. 結論

提供済みのIFVI PDFだけでは、今回の追加カテゴリには足りない。ファイルは**Water Consumption Topic Methodology(水消費)**の最終版であり、汚染、廃棄物、土地利用の方法論・係数は含まない。

IFVIを追加カテゴリに使う場合は、別途以下が必要になる。

1. Global Value Factor Database
2. Interim Air Pollution Methodology + Model and Technical Manual
3. Interim Land Use and Conversion Methodology + Model and Technical Manual
4. Interim Waste Methodology + Model and Technical Manual
5. Interim Water Pollution Methodology + Model and Technical Manual
6. PRISMの商用SaaS利用についてのIFVIからの書面許諾

一方、LIME3については追加購入を待つ必要はない。提供済みExcelと、リポジトリ内の抽出CSVが980行×24列で一致している。PRTR汚染・廃棄物・土地利用の内部パイロットは、既存LIME3資産で開始できる。

ただし、**PRTR物質とLIME3基本フローの対応表、顧客の排出/廃棄物/土地データは別途必要**である。

## 1. 取得状況と実装ブロック

| データ/係数 | 状態 | 用途 | 取得・確認方法 | 何を止めるか |
|---|---|---|---|---|
| AIST-IDEA Ver.4.0 LIME3係数 | 取得・抽出済み | 汚染MVP、廃棄物、土地パイロットの第1手法 | §3 | 止めない |
| 年度別PRTR個別事業所データ | 公式R06列を検証済み/毎年更新 | 公開デモ、顧客データとの照合 | §2.1 | 対象年度・対象施設の実投入 |
| 年度別PRTR対象物質マスタ | 未取得 | PRTRコード、物質名、CAS等の正規化 | §2.2 | PRTR→LIME3対応表 |
| PRTR→LIME3対応表 | v1実装済み（2023年009・大気のみ） | 計算可能物質の確定 | §2.3 | 他物質・媒体はレビュー待ちのまま`unmapped` |
| 顧客PRTR排出データ | 顧客待ち | 実案件の一次入力 | §2.4 | 実顧客でのGATEのみ |
| IFVI追加カテゴリ一式 | 未取得/許諾未確定 | 第2/第3手法 | §4 | IFVI手法の有効化のみ |
| CE Delft 2024 v1.1 + Erratum | 公開資料あり、埋込条件未確定 | PRTR汚染の第2手法 | §5 | CE Delft手法の有効化のみ |
| ESVD | 日本カバレッジ確認済み、商用契約未 | 土地利用・生態系サービスの追加手法 | §6 | ESVD手法の有効化のみ |
| 廃棄物活動データ | CSV取込・validator実装済み/顧客値待ち | 廃棄物算定 | §7 | 実顧客の廃棄物算定 |
| 土地転換前後データ | CSV取込・validator実装済み/顧客値待ち | 土地利用・改変算定 | §8 | 実顧客の土地算定 |

### 1.1 実装済みの取得・保持境界

- PRTRは本紙・別紙・他業種（CP932）と明示crosswalk（UTF-8）を全件検証し、事業所×物質×媒体の長形式へ正規化する。
- 廃棄物・土地利用は`/api/intake-template?name=waste|land-use`のUTF-8 CSVを全件検証する。
- いずれもアップロード原本はDBへ保持しない。ファイル名、SHA-256、行数、文字コードと正規化行だけを追記保存する。
- LIME3対応がない行、空欄、PRTR移動量、ライセンス停止は0円にせず、それぞれ`unmapped`、`blocked`、`transfer_only`として算定明細へ残す。
- 現在のレビュー済み対応範囲は`docs/data/mappings/`のCSVを正とする。名称のファジー一致は計算に使わない。

### 1.2 動作確認用サンプル

`/sites`の各取込パネルから、実際のvalidatorが受け付ける架空サンプルをダウンロードできる。

| 対象 | ファイル | 文字コード | 主な架空値 |
|---|---|---|---|
| PRTR | `lib/intake/prtr/samples/honshi.txt`、`besshi.txt`、`other-industries.txt` | CP932 | コード009、大気120kg、事業所外移動1,000kg |
| PRTR拠点対応 | `lib/intake/prtr/samples/facility-crosswalk.csv` | UTF-8 | `DEMO-FAC-001` → `site-042` |
| 廃棄物 | `lib/intake/category-inputs/templates/waste.csv` | UTF-8 | 産廃1,000kg、オフサイト埋立、内部処理費25,000円 |
| 土地利用 | `lib/intake/category-inputs/templates/land-use.csv` | UTF-8 | 森林→建物500m²、建物用地占有500m²year |

すべて架空値であり、実在企業の届出・台帳・開発案件を表さない。PRTRサンプルは4ファイルを同時に取り込み、その後に廃棄物、土地利用の順で確認できる。廃棄物サンプルはPRTRの事業所外移動量を`DEMO-FAC-001:1:offsite_waste`で参照するため、PRTRより先には登録できない。

有効な追加カテゴリ入力バッチが一件もない環境では、同じ値を`lib/demo/category-expansion-data.ts`からデモrunへ供給する。実入力が一件でも有効になれば、架空デモ値は全カテゴリともrunから除外し、実入力と混在させない。

## 2. PRTR汚染MVP

### 2.1 年度別個別事業所データ

**一次取得先:** 環境省「個別事業所のデータ」
https://www.env.go.jp/chemi/prtr/kaiji/index.html

環境省は年度ごとのZIPを公開している。2026-08-28時点の最新は令和6年度データで、ZIP内は次の3ファイルに分かれる。

- `本紙.txt`: 事業者・事業所・所在地・業種等
- `別紙.txt`: 第一種指定化学物質ごとの排出量・移動量
- `他業種.txt`: 主たる業種以外の業種

**取得手順:**

1. 公式ページから対象年度のZIPを取得する。リンクURLを固定値にせず、取得ページと年度をマニフェストへ保存する。
2. ZIPを展開せず原本のSHA-256を記録する。
3. 展開後の3ファイルもそれぞれSHA-256、文字コード、行数を記録する。
4. 3ファイル共通の整理番号で結合する。事業所名の文字列一致を結合キーにしない。
5. `別紙.txt`の横持ち排出量を、次の長形式へ正規化する。

| 必須列 | 意味 |
|---|---|
| `reporting_year` | PRTR排出年度 |
| `facility_id` | 整理番号を基礎にした年度内事業所ID |
| `business_entity_name` / `facility_name` | 原文表記 |
| `prefecture` / `municipality` | 所在地 |
| `prtr_substance_code` | 年度別の第一種指定化学物質コード |
| `release_medium` | `air` / `public_water` / `soil` / `onsite_landfill` |
| `quantity_kg` | 媒体別の直接排出量。単位をkgへ正規化 |
| `transfer_destination` | `sewer` / `offsite_waste`。汚染MVPでは計算対象外 |
| `source_record_hash` | 元行の再現用ハッシュ |

**ライセンス:** 環境省サイトは、特記がないコンテンツに公共データ利用規約第1.0版を適用している。出典と、加工した場合は加工主体を表示する。取得時に当該ZIP固有の追加条件がないことも確認する。
https://www.env.go.jp/mail.html

**注意:** 公開PRTR値は顧客の最新操業データの代替ではない。デモ・事前分析・顧客照合に用い、顧客向け確定計算では対象年度・組織境界・事業所対応を顧客が確認する。

### 2.2 年度別対象物質マスタ

2023年度以降の第一種指定化学物質は515物質だが、過年度には物質数とコード体系が異なる。最新515物質を過年度データへ一律適用しない。

**取得先:**

- 環境省 PRTRインフォメーション広場: https://www.env.go.jp/chemi/prtr/risk0.html
- 対象年度のPRTR届出要領/対象化学物質一覧
- 必要に応じ、環境省の化学物質ファクトシート

**保存する列:** `list_version`、`effective_year_from/to`、`prtr_substance_code`、政令番号/管理番号、正式物質名、別名、CAS RN(単一とは限らない)、特定第一種区分、根拠URL、取得日、原本ハッシュ。

### 2.3 PRTR→LIME3基本フロー対応表

この対応表が汚染MVPの実質的な計算境界になる。成果物は`docs/data/mappings/prtr-lime3-flow-mapping-v1.csv`とし、次の列を必須にする。

| 列 | 内容 |
|---|---|
| `mapping_version` | 対応表の版 |
| `prtr_list_version` / `prtr_substance_code` | 入力側識別子 |
| `cas_rn` | 補助識別子。名称より優先 |
| `release_medium` | 大気/公共用水域/土壌/埋立 |
| `lime3_flow_code` | LIME3基本フローコード |
| `lime3_flow_name` | 監査用原文 |
| `factor_perspective` | 原則`producer_country_japan` |
| `factor_unit` | 例`US$/kg` |
| `mapping_status` | `exact` / `reviewed_alias` / `unmapped` / `not_applicable` |
| `mapping_basis` | CAS一致、法令別名、媒体一致等の根拠 |
| `reviewed_by` / `reviewed_at` | 人の確認証跡 |

**作成規律:**

1. PRTRコード、CAS、媒体が一致する候補を機械抽出する。
2. 名称のファジー一致は候補提示にだけ使い、自動確定しない。
3. 混合物、異性体群、金属化合物群を単一物質係数へ勝手に割り当てない。
4. 大気係数を水・土壌排出へ流用しない。
5. 係数空欄はゼロではなく`unmapped`とする。
6. 対応率を「物質数」と「排出量kg」の両方で集計する。

### 2.4 顧客から受け取るPRTRデータ

公開データと同じ正規形を受け入れるが、最低限次を追加で確認する。

- 会社・事業所とPRISM `siteId`の対応
- 対象期間と集計境界
- 排出媒体別の値か、排出・移動量の合計値か
- 単位と丸め方法
- 修正届、ゼロ、未測定、届出対象外の区別
- 公開値との差異と差異理由

顧客ファイルの原本はPRISMのDBへ保存しない。顧客側の原本管理を維持し、PRISMにはファイルSHA-256と正規化後データの原本行ハッシュを持たせる。

## 3. LIME3(AIST-IDEA Ver.4.0)

### 3.1 取得済み原本と照合結果

| 対象 | SHA-256 | 状態 |
|---|---|---|
| 提供済みExcel | `fb5273861253be1f0d732d81c128a3a5817affcdd1f9a32323931bf81d3eaf53` | 社内原本。リポジトリへ格納しない |
| 抽出CSV | `63e1744476fc33fb741e176bcea94f0e9dbd5c757a48e9aa620f70d22a959844` | `docs/data/external/aist-idea-lime3-v4.0-lcia-coefficients.csv` |

`LCIA係数_LIME3`のExcel行6〜985、列A〜Xと、抽出CSVの980データ行を文字列表現で全件比較し、差分0を確認した。

### 3.2 今回使える候補

- PRTR汚染: 個別化学物質の`排出/大気`、`排出/水圏`、`排出/陸域`フロー。PRTR対応表で媒体まで一致した行のみ
- 後続大気汚染: NOx、PM2.5、SO2/SOx、VOC等。ただしNH3は係数欄が空の行があり、そのままでは計算不可
- 廃棄物: 一般廃棄物/産業廃棄物の埋立物フロー等。処理経路と廃棄物種類の粒度が一致するものだけ
- 土地占有: その他樹木畑、果樹園、幹線交通用地、建物用地、田、畑地等
- 土地改変: 森林から幹線交通用地、田、建物用地、果樹園、畑地等への転換、最終処分場建設等

係数が空欄の森林占有、鉱物採掘用地、最終処分場用地等は、近い土地用途で代用しない。

### 3.3 利用列とライセンス

汚染・廃棄物・土地は日本の事業所活動であるため、内部パイロットでは`利子率2%、生産国、日本 / 統合化 / US$`を使う。水は既存判断どおり`消費国、日本`を維持する。

既存文書上、標準版ライセンスは2027-06-30まで有効。元Excel・抽出DBを第三者へ配布しない。顧客向けには係数表そのものではなく、入力、出典版、計算結果、適用/未適用理由だけを表示する。契約更新時にSaaS出力の扱いを再確認する。

## 4. IFVI

### 4.1 提供済みPDFがカバーする範囲

提供済み`IFVI_VBA_Environmental_Methodology-2_Water-Consumption_FIN_04.pdf`は、Water Consumption Topic Methodologyと国別水消費Value Factorを収録する。日本の水消費係数はあるが、Air Pollution、Waste、Land Use and Conversion、Water Pollutionの係数ではない。

Content Termsは個人・非商用利用を基本とし、製品販売・公開報告・商取引での利用と第三者へのアクセスを制限している。PRISMへの組込は書面確認前に行わない。

### 4.2 別途取得するもの

公式取得ページ:
https://ifvi.org/methodology/environmental-topic-methodology/interim-methodologies/download-the-interim-methodologies/

登録した利用者本人が以下を取得し、各ファイルの規約・版・ハッシュを記録する。

- Global Value Factor Database
- Air Pollution / Land Use and Conversion / Waste / Water Pollutionの各Interim Methodology
- 同4テーマのModel and Technical Manual

**保管:** Content Termsが第三者アクセスを制限するため、原本は一般リポジトリへコミットしない。アクセス制御された社内ストレージに保管し、PRISMリポジトリにはマニフェスト、対応表、許諾された範囲の実装メタデータだけを置く。

### 4.3 PRTRに対する適合性

IFVI Air PollutionはPM10、PM2.5、SO2、NOx、NH3、VOCの6種が中心で、PRTR 515物質全体の第2手法にはならない。PRTRとの重なりを確認し、重なる物質だけに適用する。

IFVI Water Pollutionは水域への化学物質排出に使える可能性がある。Global Value Factor Database取得後、PRTR水域排出物質とのコード/CAS/媒体対応率を測る。大気・土壌排出へ流用しない。

### 4.4 照会事項

`docs/business/outreach-action-plan.md`の下書きを用い、少なくとも次を書面で確認する。

- 有償SaaSへの係数埋込、顧客別計算、顧客向け結果表示
- 原係数を見せず派生結果だけ出す場合の条件
- 社内評価/パイロットと商用提供の境界
- 4つのInterim MethodologyとGlobal VF Databaseを一括で許諾できるか
- 利用者登録、保管、監査、更新通知、帰属表示の条件

方法論の技術質問先は公式ページ記載の`research@ifvi.org`。契約窓口は`contact@ifvi.org`へ確認する。

## 5. CE Delft

**取得先:** Environmental Prices Handbook 2024: EU27 version(v1.1、Erratum含む)
https://cedelft.eu/publications/environmental-prices-handbook-2024-eu27-version/

同版はEU27平均、基準年2019、500超の有害物質についてEUR/kgの下限・中央・上限値を提供する。PRTRとの物質粒度が比較的近いため、汚染の第2手法候補とする。

**取得手順:**

1. 本文PDFとErratumを同時に取得し、版を`2024-v1.1`として固定する。
2. Annexの物質、CAS、排出媒体、下限/中央/上限を抽出する。
3. PRTRマスタとの対応率を、CAS・物質数・排出量kgで集計する。
4. EU平均値を日本の個別工場へそのまま「高精度」と表示しない。地理移転をティアCまたは未確定として記録する。
5. 商用埋込の書面回答が得られるまでプラグインを`pending_review`にする。

**照会事項:** 係数値の抽出・DB化、商用SaaS埋込、派生計算結果の表示、顧客への監査根拠提示、帰属、料金、更新版の扱い。汎用の`ce@ce.nl`に加え、公式ページ記載の担当者連絡先へ送付する。

## 6. ESVD

**条件確認先:** https://www.esvd.info/terms-and-conditions
**連絡先:** `esvd@fsd.nl`

商用利用にはESVDのstrategic partnerになる必要があり、FSDは商用利用を拒否できる。LIME3土地パイロットはESVDの回答を待たずに進める。

確認する事項:

- strategic partnerの料金、期間、更新、利用者数
- 個別レコードの検索、一括取得、APIの可否
- 原データを表示せず便益移転した派生結果だけを出す条件
- 日本/東アジアの陸域生態系・生態系サービス別カバレッジ
- 顧客レポートの公開義務と、機密案件への適用可否
- 修正・対応表・派生物の扱い

既存調査の日本67件は「日本の土地利用案件へ十分」を意味しない。陸域/海洋、利用価値/非利用価値、生態系サービス、年代、単位を分けて適合度を再集計する。

## 7. 廃棄物データ

顧客から、マニフェスト、廃棄物管理台帳、委託先報告等を受け取る。最低限の正規形:

| 列 | 内容 |
|---|---|
| `site_id` / `reporting_period` | 境界 |
| `waste_type_code` / `waste_type_name` | 一廃/産廃と詳細種類 |
| `hazardous_flag` | 有害性の区別 |
| `treatment_route` | 再使用、再生、焼却、埋立、その他 |
| `quantity_kg` | 湿重量/乾燥重量の区別を別列で持つ |
| `onsite_or_offsite` | 処理場所 |
| `contractor` / `manifest_id` | 追跡情報 |
| `internal_treatment_cost` | 既内部化費用。外部費用と混ぜずM5で比較 |

PRTRの事業所外移動量と廃棄物台帳を突合し、同じ物質/廃棄物を「PRTR汚染」と「廃棄物」で二重計上しない。リサイクル率だけから処理経路別量を推定しない。

## 8. 土地利用・土地改変データ

### 8.1 顧客を一次情報源とする項目

- 案件/拠点ID
- 対象ポリゴンまたは境界測量図
- 面積(m²)
- 転換前・転換後の土地用途
- 転換日または占有期間
- 新規転換、既転換地の継続占有、復元の区別
- 許認可・環境アセスメント等の根拠資料

土地改変は`m²`、土地占有は`m²year`を基本とし、両者を同じ活動量として合算しない。

### 8.2 公開データによるスクリーニング

**国土数値情報 土地利用細分メッシュ(2021年度):**
https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-L03-b-2021.html

全国100mメッシュ、11区分、CC BY 4.0。案件ポリゴンと重ね、顧客申告の土地用途を照合する。100mメッシュは小規模案件の境界確定には粗く、転換前の状態を単独で証明しない。複数年度の判読方法差もあるため、時系列差分をそのまま実転換量としない。

### 8.3 LIME3土地クラスへの対応

国土数値情報/顧客土地用途からLIME3基本フローへの対応表を作る。1対多・不明は自動確定しない。LIME3係数が空欄の土地用途は未算定とする。成果物に、入力土地クラス、LIME3フローコード、面積、対応根拠、レビュー者、適用/未適用を残す。

## 9. 外部連絡と人間GATE

メール本文は`docs/business/outreach-action-plan.md`にある。AIは下書き、回答の整理、実装ゲート更新までは行えるが、送信主体の確定、価格交渉、契約締結は人間が行う。

| GATE | 通過条件 | 通過前に許されること | 禁止 |
|---|---|---|---|
| H-IFVI | 商用範囲・保管・表示条件を書面取得 | 方法論調査、非商用内部評価 | 顧客向け係数利用 |
| H-CE | 係数抽出/埋込/派生表示を書面取得 | 公開報告書の方法論調査 | 顧客向けプラグイン有効化 |
| H-ESVD | strategic partner条件に合意 | LIME3土地パイロット | ESVDレコードの商用利用 |
| H-CUSTOMER | 対象年度・境界・site対応を顧客確認 | 公開PRTRデモ | 顧客確定値としての表示 |

## 10. 完了条件

- 各原本に取得日、URL、版、SHA-256、ライセンス状態がある
- PRTRの年度別コード体系が保持されている
- PRTR→LIME3対応表が媒体別で、未対応を明示する
- 顧客入力と公開PRTRを区別できる
- PRTR直接排出と廃棄物/移動量の二重計上テストがある
- 土地改変(`m²`)と土地占有(`m²year`)を分離する
- 許諾待ちの手法は`pending_review`のまま計算に入らない
