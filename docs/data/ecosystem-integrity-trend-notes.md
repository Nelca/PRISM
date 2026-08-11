# 生態系完全性トレンドのデータ源調査メモ

**目的:** `docs/data/acquisition-runbook.md` §3.9(A-11)の成果物。GAP-13の`rapidIntegrityDecline`(急速な劣化)基準について、時系列(トレンド)を持つ生態系完全性指標が実在するかを調査する。
**参照元:** `packages/core/src/types/site.ts`(`CriteriaMet.rapidIntegrityDecline`)、`packages/core/src/site/criteria.ts`(`EMPTY_CRITERIA`で恒久的に`false`)、design-rationale-log D-90・D-110
**調査日:** 2026-08-10 / **実装日:** 2026-08-10(E-8、本ファイル§8)
**手順書の候補5件を1件ずつ調査した結果、(a)時系列粒度 (b)商用利用可否 (c)拠点座標照会可否 の3条件を満たす候補が1件見つかった。** D-90の前提(「使えるデータ源がない」)を見直す必要がある発見だったため、**E-8の判断を経て実装した**(§8)。

---

## 結論(要約)

| 候補 | (a) 時系列粒度 | (b) 商用利用 | (c) 拠点座標照会 | 判定 |
|---|---|---|---|---|
| Biodiversity Intactness Index(BII、NHM) | △(公開版は5年おき2000-2020。年次版は要問合せ) | △(公開版はCC BY-NC-SA、商用は個別許諾) | ○(10kmラスタ、点抽出可) | 条件付き該当 |
| Forest Landscape Integrity Index(FLII) | ×(2019年の単発スナップショットのみ、更新版なし) | 未確認(時系列が無いため確認不要と判断) | ○(300mラスタ) | **該当なし(構造的に時系列不可)** |
| Ecosystem Integrity Index(名称が3系統存在、下記参照) | 系統により異なる(下記参照) | 系統により異なる | ○(いずれも1km級ラスタ) | **下記の系統③のみ該当** |
| WWF Biodiversity Risk Filterのトレンド指標 | ×(実体はBIIの2005年単年値。トレンド指標という別物は存在しない) | — | — | **該当なし** |
| IBAT/STAR系の経年データ | ×(IBAT公式資料で「将来の開発課題」と明記。現時点は単年スナップショット) | 有償(IBAT契約、B-1と同じ枠) | ○(5kmラスタ) | **該当なし(現時点)** |

**唯一の該当候補:** Sun, Hughes, He, Yu (2026) *“Ecological Integrity Index, timely annual tracking of biodiversity change”*, *Scientific Data*(Ecosystem Integrity Indexの系統③、下記2.3)。**CC BY 4.0・年次(2015-2023、9年分)・1kmラスタ(GeoTIFF)・Zenodoで無償公開。**この4条件を同時に満たす唯一の候補であり、5候補中これのみが実装可能な水準にある。

---

## 1. Biodiversity Intactness Index(BII、Natural History Museum)

**確認先:** `https://www.nhm.ac.uk/our-science/services/data/biodiversity-intactness-index.html`、`https://data.nhm.ac.uk/dataset/bii-developed-by-nhm-v2-1-1-limited-release`(データポータル本体は自動取得ツールに403を返すため、検索結果とキャッシュされた要約からの確認)

**(a) 時系列粒度:** v2.1.1(Open Access, Limited Release)は2000・2005・2010・2015・2020年の**5年おき**のグローバルラスタ(約10km解像度)。完全な年次版(2000〜2020年、毎年)は存在するが、NHMへの直接問い合わせ(`biodiversityfuturesexplorer@nhm.ac.uk`)が必要な非公開版。国・地域・世界単位の集計値は1970〜2050年(SSPシナリオ別の将来予測込み)まで公開データポータルにある。

**(b) 商用利用:** 公開版(v2.1.1 Limited Release)は**CC BY-NC-SA**(非商用限定)。商用利用には別途NHMへの許諾申請が必要(B-3のIFVI同様、個別照会が前提)。第三者経由の商用アクセスとしてCecil Earth(`docs.cecil.earth`)が同データを$0.20/ha(利用量に応じた課金、企業向けプランあり)で再配布しているが、これはNHMのライセンスをCecil Earthが商用向けに再許諾したものであり、PRISM側がCecil Earth経由で利用する場合もCecil Earthとの契約が別途必要。

**(c) 拠点座標照会:** 10km解像度のグリッドラスタのため、点(拠点座標)-in-ラスタ抽出が可能。本リポジトリでは`aqueduct-water-stress-notes.md`で示した手法(fiona/GDAL)と同種の技術で対応できる(ただしAqueductはポリゴン(basin)、BIIはラスタセルなので、点-in-ポリゴンではなく点でのラスタ値サンプリングになる)。

**判定:** 時系列・座標照会は満たすが、商用利用がライセンス上ネックになる(IFVIと同種の課題)。

---

## 2. Forest Landscape Integrity Index(FLII)

**確認先:** Wikipedia記事(Grantham et al. 2020の要約)、`https://www.forestintegrity.com/`(自動取得ツールに403)

**(a) 時系列粒度:** **無い。**Grantham et al. (2020)による2019年時点の単発スナップショットのみで、300m解像度。「将来的に年次更新も可能」という記述はあるが、2026年現在まで更新版・新版の存在を示す情報は見つからなかった。

**判定:** **構造的に時系列を持たないため、「急速な劣化」の判定材料にできない。**商用利用条件の確認は不要と判断し、確認していない(時系列が無い時点で不採用が確定するため)。

---

## 3. "Ecosystem Integrity Index" — 名称が同じ・似た3系統が存在(要注意)

調査の過程で、「Ecosystem/Ecological Integrity Index」という名称(またはその類似名)を掲げる**互いに無関係な3つの取組み**が見つかった。手順書執筆時にどれを指していたかは不明だが、混同を避けるため3つとも記録する。

### 3.1 UNEP-WCMC版(Hill et al. 2022、bioRxivプレプリント)

**確認先:** `https://www.biorxiv.org/content/10.1101/2022.08.21.504707v1.full`

著者11名全員がUNEP-WCMC(国連環境計画・世界自然保護モニタリングセンター)所属。1km²解像度・グローバルカバレッジだが、**2020年前後を基準とした単発の全球評価であり、時系列ではない。**「将来のモニタリングに使うことを想定して設計した」という記述はあるが、過去からの経年変化を示すデータではない。データの公開場所・ライセンスは論文本文からは確認できなかった。

**判定:** 時系列不足のため不採用。

### 3.2 The Landbanking Group版(UNEP-WCMCの枠組みを商用化)

**確認先:** `https://www.thelandbankinggroup.com/science/indicators/ecosystem-integrity`

The Landbanking Group GmbH(ドイツの環境データ企業)が、上記3.1のUNEP-WCMCの枠組みに基づき商用提供している指標。**有償・要問合せ("Get in touch")の商用プロダクト**で、履歴データは**2025年以降のみ**(=まだ経年変化を検出できる年数が無い)。300m解像度。

**判定:** 有償契約が前提(A-5〜A-8と同種の扱いになる)かつ、現時点でトレンド判定に使える年数が無いため不採用。仮に契約する場合でも、数年分データが蓄積するまで「急速な劣化」の判定はできない。

### 3.3 single-earth版(GitHubオープンソース、ライセンス不明)

**確認先:** `https://github.com/single-earth/ecosystem-integrity-index`、`https://ecosystemintegrityindex.org/blog/introducing-the-open-source-eii`

Single.Earth社(自然資産のトークン化を手掛ける企業)が「オープンソース化した」と発表しているが、**GitHub API上でライセンスは`null`(未検出)。**リポジトリにLICENSEファイルが存在せず、「オープンソース」という広報上の説明と、著作権法上の実際の許諾状態(既定では All rights reserved)が一致していない。300m解像度、グローバル。時系列の年数は文書から確認できなかった。

**判定:** ライセンスが法的に確定していないため、現状では商用利用の根拠にできない(IFVIのGitHub非公式ミラー等と同じ「広報表現と実際のライセンスの不一致」パターン)。

### 3.4 Sun, Hughes, He, Yu版(2026年、*Scientific Data*)— ★該当

**確認先:** `https://www.nature.com/articles/s41597-025-06485-5`(論文、要ログインのため要約は検索結果経由)、`https://zenodo.org/uploads/15598796`(データ本体、直接確認できた)

**名称:**論文タイトルは"**Ecological Integrity Index**"(Ecosystemではなく**Ecological**)であり、上記3.1〜3.3とは無関係の別の学術グループによる、別の指標。BII・Global Human Modification footprint・NPP(正味一次生産量)の3要素を合成した独自の複合指標。

**(a) 時系列粒度:** Zenodoデータセット(`https://zenodo.org/uploads/15598796`、タイトル"Annual biodiversity patterns datasets 2015-2023")を直接確認。**年次(annual)・2015年〜2023年の9年分。**論文タイトル自体が"timely annual tracking of biodiversity change"であり、経年変化の検出を主目的として設計されている。

**(b) 商用利用:** Zenodoの記録で**ライセンスは"CC-BY-4.0"**と直接確認した。CC BY 4.0は商用利用・再配布・改変を許可する(World Bank・ENCORE等、本リポジトリで既に採用しているライセンスと同種)。個別許諾・契約は不要。

**(c) 拠点座標照会:** 1km解像度のGeoTIFF(検索結果の要約による。Zenodoの記録本体では解像度の明記を確認できなかったため、論文本文での再確認が望ましい)。ラスタのため、BII単独版と同様に点でのラスタ値サンプリングで拠点ごとの値を取得できる。データは`Annual biodiversity data.zip`(8.63GB)としてまとめて配布されており、"may be regularly updated in the future"(将来的に更新される可能性がある、最新版を推奨)との記載がある。

**判定:** **(a)(b)(c)すべてを満たす、5候補+3系統中唯一の候補。**

---

## 4. WWF Biodiversity Risk Filterのトレンド指標

**確認先:** `https://cdn.kettufy.io/prod-fra-1.kettufy.io/documents/riskfilter.org/BiodiversityRiskFilter_Methodology.pdf`(方法論文書本体、PDF全99ページを直接確認。**この環境にpoppler(pdftotext)を導入したことで、今回初めてテキスト抽出に成功した**)

**判明した実体:** WWF Biodiversity Risk Filterの"Ecosystem Condition"指標(2.4.1節)は、**上記1のBIIをそのまま使っており、かつ引用しているのはNatural History Museum (2016)の元論文の基準年である2005年単年のデータ**(方法論書 p.59「2005 Biodiversity Intactness (%)」のテーブル)。つまり「WWF独自のトレンド指標」という別物は存在せず、実体は**単年(2005年)のBIIスナップショット**である。

**判定:** **該当なし。**「トレンド指標」という名称の候補自体が誤解に基づいていた(手順書執筆時点でそのような独立した指標があると想定されていたが、実在しない)。なお、このWWF Biodiversity Risk Filter自体は既に`lib/demo/company.ts`で`dependency_impact`/`ecosystem_integrity`層として`licenseMode: "reference_only"`で利用しており、この扱いに変更は不要。

---

## 5. IBAT/STAR(Species Threat Abatement and Restoration)系の経年データ

**確認先:** IBAT公式ブリーフィングノート(`https://app.ibat-alliance.org/pdf/star-industry-briefing-note.pdf`、PDF本文を直接確認)

**判明した実体:** ブリーフィングノート本文に明記:

> "**Future development of STAR will allow it to be used to track progress towards conservation goals**, inform adaptive management and report results to stakeholders."

**つまりSTARの経年トラッキング機能は「将来の開発課題」として明記されており、2026年現在は単年スナップショットの指標である。**加えて、STARは「種の絶滅リスク」を対象にした指標であり、そもそも「生態系(エコシステム)の完全性」ではなく「種(スピーシーズ)の脅威」を測るものである点も、当初想定していた用途とはズレがある(ブリーフィングノート内でも "Other components, such as ecosystem extent and condition, require additional metrics" と、STAR自身が生態系の広さ・状態を測る指標ではないと明言している)。

**判定:** **該当なし(現時点)。**将来STARに経年トラッキング機能が実装されれば再検討の余地はあるが、現状はデータが存在しない。またIBAT契約(B-1、Enterprise Plus 約$35,000/年)の枠内のデータであり、既存のWDPA/KBA契約検討と同じ有償枠に入る。

---

## 6. 結論とM1 D-2への影響

design-rationale-log D-90は「`rapidIntegrityDecline`は使えるデータ源が無いため恒久的にfalseとする」という前提で書かれている。**今回の調査で、この前提の一部が変わった:**「無い」のではなく「1件だけ、条件を満たす候補が存在する」。

ただし、以下の理由により、**この調査結果だけでは直ちに実装に進めない**:

1. 「急速な劣化」をどう定義するか(何年で何%以上の低下を「急速」とみなすか)という**閾値の判断**が別途必要。これはAqueductの水ストレス閾値(`bws_cat >= 3`)と同種の、データではなく判断の問題(E-1〜E-7と同種の論点)
2. 現在の実装(`packages/core/src/site/criteria.ts`)はベクタ(ポリゴン)の点-in-ポリゴン照会のみを想定しており、ラスタ(GeoTIFF)の点抽出は新規のコード基盤が必要(Aqueductで実証したfiona/GDALの技術は転用できるが、今回はポリゴンではなくラスタなので実装は別物になる)
3. Zenodoのデータは8.63GBの単一zipであり、実運用でどう配置・照会するか(毎回ダウンロードするのか、事前に処理してルックアップテーブル化するのか)の設計判断が必要
4. データセット自体が2025年6月公開・"may be regularly updated"とあり、**継続的にメンテナンスされる保証がない**(1件の学術論文の付随データという性質上、IFVI・WWF・WRIのような組織的な継続更新体制ではない)

**推奨(調査時点):** この調査結果自体をGAP-13の根拠資料として確定させ(「恒久的に評価不能」ではなく「候補はあるが実装は別途判断」に訂正)、実装するかどうかは人間の判断事項(E-8として新設)に回す。

**追記(2026-08-10、E-8の判断結果):** 人間の判断により実装することが決定し、同日中に実装した。上記1〜4の懸念への対応は以下の通り:

1. 閾値はIUCN Red List Categories and Criteria v3.1のCriterion A2(10年で30%以上の減少、Vulnerable相当)を借用した(§8参照)。STARがIUCN Red Listを基盤にしている前例と整合させる判断
2. ラスタの点抽出は`rasterio`(Python、この調査作業限りのオフラインスクリプト)で実施。Aqueductのfiona/GDAL(ベクタのpoint-in-polygon)とは別の技術(ラスタセルの値サンプリング)だが、「この調査作業限りのオフライン照会」という運用方針(§4末尾参照)は同じ
3. 3拠点(site-042・050・060)分のみ、2015年と2023年の2つの年次GeoTIFFから該当ピクセルの値を抽出し、`lib/demo/company.ts`にハードコードした(Aqueductの`BASELINE_WATER_STRESS_CATEGORY`と同じパターン)。8.63GBの全データを都度照会する仕組みは実装していない(実データで拠点数が増えた場合の課題は§8末尾に記載)
4. データの継続更新保証の欠如は残存する既知の制約として受け入れた(実装後も残るリスクとして記録)

詳細な実装結果は§8。

---

## 7. 副次的な発見:pdftotext(poppler)の導入

このリポジトリの環境には元々`pdftotext`/`pdftoppm`(poppler)が入っておらず、`docs/data/acquisition-runbook.md` §4の「AIが取得できなかった」表で複数件(CICESガイダンス等)がこれを理由に人間依存とされていた。今回`brew install poppler`で解決したため、**以降のPDF調査(本調査のWWF方法論書・IBATブリーフィングノート含む)はAI側で完結できるようになった。**同じ制約が残っている項目(§4の表)の再確認は別タスクとして検討の余地がある。

---

## 8. 実装結果(2026-08-10、E-8の判断後)

### 8.1 データ取得(オフラインスクリプト、この調査作業限り)

Zenodo record 15598796のダウンロードURLは1本の8.63GB zip(`Annual biodiversity data.zip`)で、内部に非solid・非圧縮(STORED)で格納された8.0GBの`biodiversity.7z`(9年分の年次GeoTIFF、各約700MB)を含む。

- **単一コネクションのダウンロードは約1MB/s(全体で約2時間超になる見積り)だったため、`requests`のHTTP Range指定を使い、48並列のスレッドでチャンク分割ダウンロードした。**アグリゲートで約17MB/s まで向上し、8.0GBの取得は約5分(304秒)で完了した
- zip内の`biodiversity.7z`エントリはSTORED(無圧縮)のため、zipのローカルファイルヘッダ(ZIP64拡張フィールド含む)を手動でバイト単位まで解析し、該当バイト範囲だけを直接range取得した(`human footprint.7z`等の不要なエントリはダウンロードしていない)
- `brew install p7zip`で`7z`コマンドを導入し、`biodiversity.7z`は非solidアーカイブであることを確認(`Solid = -`)。必要な2年分(`biodiversity_2015_final.tif`・`biodiversity_2023_final.tif`)のみを選択的に展開した(9年分すべての展開はしていない)
- `pip install rasterio`(この環境にはGDAL/rasterioも元々入っていなかった)で各GeoTIFF(EPSG:4326、約0.00833度=1km解像度)から3拠点の座標に対応するピクセル値を直接読み取った

### 8.2 抽出した値と閾値判定

| 拠点 | 座標(lng,lat) | 2015年の値 | 2023年の値 | 相対低下率 | 閾値(30%)判定 |
|---|---|---|---|---|---|
| site-042(本社工場・愛知県) | 136.9, 35.1 | 0.018089 | 0.017832 | 約1.42%減 | false(未満) |
| site-050(金属加工工場・大阪府) | 135.5, 34.7 | 0.024808 | 0.024436 | 約1.50%減 | false(未満) |
| site-060(海外サプライヤー・グジャラート州) | 72.6, 23.0 | 0.024069 | 0.023742 | 約1.36%減 | false(未満) |

**観察事項:** 3拠点とも工場・産業用地の座標であり、値自体(0.02前後)はデータセット全体のヒストグラム(大半のセルが0付近に集中、平均0.0043・中央値0.000)から見ても既に低い水準にある。2015年→2023年の変化は3拠点ともわずか(約1.4〜1.5%減)で、閾値(30%)には遠く及ばない。**これは実データに基づく誠実な結果であり、「3拠点いずれも急速な劣化には該当しない」という結論そのものが正しい出力である**(D-15の原則:結果を恣意的に「true」に寄せていない)。サニティチェックとしてアマゾン内陸部・ロンドニア州(ブラジル、既知の森林破壊フロンティア)の座標も同様に抽出し、この抽出パイプライン自体が機能していることを確認した(いずれも小さな変化で、単一ピクセルの座標選びに強く依存するため参考情報のみ)。

### 8.3 コードへの反映

| ファイル | 内容 |
|---|---|
| `packages/core/src/site/ecosystem-integrity-trend.ts`(新規) | `isRapidIntegrityDecline()`。IUCN Red List Criterion A2(30%閾値)による純粋関数。`water-stress.ts`と同じ「呼び出し側がboolean化する」パターン |
| `packages/core/src/site/ecosystem-integrity-trend.test.ts`(新規) | 閾値の境界値・上昇(改善)ケース・`startValue<=0`のエッジケースを検証 |
| `packages/core/src/pipeline/assessment-pipeline.ts` | `AssessmentPipelineOptions`に`resolveCriterion`(D-90が定めた注入点)を追加し、`buildMaterialIssues`へ透過的に渡すよう変更 |
| `lib/demo/company.ts` | `ECOLOGICAL_INTEGRITY_TREND`(3拠点の実データ)・`resolveCriterionForDemo`(`ecosystem_integrity` layerTypeを`dataSource`文字列で`highEcosystemIntegrity`と`rapidIntegrityDecline`に振り分ける)・`LAYER_LOOKUPS_BY_SITE`への追加エントリ |
| `lib/demo/run-demo-pipeline.ts` | `runAssessmentPipeline()`呼び出しに`resolveCriterion: resolveCriterionForDemo`を追加 |
| `lib/demo/rapid-integrity-decline.test.ts`(新規) | 3拠点で`rapidIntegrityDecline`が`unevaluatedCriteria`から外れ、実データに基づき評価されることを検証する統合テスト |

### 8.4 動作確認

- `npx tsc --noEmit`・`npx vitest run`(382件)がすべてgreen
- dev serverを起動し、`/sites`ページの実際のレンダリング結果を取得して確認。**変更前は`unevaluatedCriteria`に「急速に劣化している」が含まれていたが、変更後は含まれなくなり**、site-042は「5基準中3基準で評価しています(未評価:生態系の完全性が高い、生物多様性の重要性が高い)」に変化した(rapidIntegrityDeclineが評価済みになった分、未評価件数が1件減った)

### 8.5 残っている制約(既知、8.6で一部解消)

- ~~拠点2件のみ実データ化。user-site-defaults.ts経由で追加されるユーザー拠点にはこのデータが無く、`rapidIntegrityDecline`は依然`no_data_source`のまま~~ → **8.6で解消**
- **データの継続更新保証がない。**Zenodo記録は個々の学術論文の付随データであり、IFVI・WWF・WRIのような組織的な継続更新体制ではない。次回の版更新時期は不明
- 抽出は2015年と2023年の**2時点のみ**(9年分の中間年は見ていない)。中間年に一時的な急落があった場合を検知できない設計になっている(IUCN基準自体も期間の開始・終了時点の比較を基本とするため、方法論としては妥当だが、限界として記録する)。8.6のグリッド化でも2時点のみを集計対象にしており、この制約は変わらない
- **8.6のグリッド化により空間精度が1km→約55km(0.5度)に低下した。**拠点固有の値ではなく地域平均値になる(下記8.6参照)

### 8.6 拠点座標への動的対応(2026-08-10、追加実装)

**目的:** 8.5で記録した「site-042/050/060の3拠点限定のハードコードで、新規に追加される拠点には対応していない」という制約を解消する。

**採用した方式:** 全世界1km解像度のGeoTIFF(9年分・合計8GB)をそのままアプリに同梱することはできないため、**2015年・2023年の2時点のみを0.5度格子(約55km四方、720列×360行=259,200セル)にGDALの`Resampling.average`で平均集計し、約2.5MBのJSONとしてリポジトリに同梱した**(`packages/core/src/site/data/ecological-integrity-grid-0.5deg.json`)。新規ホスティング・実行時の外部ネットワーク呼び出しは追加していない。

**実装:**
- `packages/core/src/site/ecological-integrity-grid.ts`(新規):`lookupEcologicalIntegrityTrend(lat, lng)`。任意の緯度経度から、含まれる0.5度格子セルの2015/2023年値を返す純粋関数。全球をグリッドで覆っているため、有効な緯度経度であれば常に値を返す
- `lib/demo/company.ts`:拠点IDに紐づく`ECOLOGICAL_INTEGRITY_TREND`(Record)を削除し、`interfacesByCategoryForSite()`が**拠点の座標(`site.location`、coordinates種別または geocoded済みのaddress種別)から動的に**`lookupEcologicalIntegrityTrend`を呼ぶように変更。`LAYER_LOOKUPS_BY_SITE`(拠点IDごとの固定データ)に登録されていない拠点でも、座標が解決できていれば`rapidIntegrityDecline`が評価される

**精度のトレードオフ(人間が選択、2026-08-10):** 1km(拠点直下のピクセル)ではなく約55km(地域平均)になる。人間の判断により、新規ホスティング・実行時ネットワーク依存を避けるこの方式を選択した(IFVIの国別minimum optionと同種の、精度と実装コストのトレードオフ)。

**検証:**
- `packages/core/src/site/ecological-integrity-grid.test.ts`:既知の座標での値・任意座標(グリッド外エラーが起きないこと)・経度180度をまたぐケース・極付近のケースを検証
- `lib/demo/rapid-integrity-decline.test.ts`:既存3拠点に加え、**`LAYER_LOOKUPS_BY_SITE`に未登録の新規拠点(座標のみ)・ジオコーディング済み拠点・座標未解決拠点**の3パターンを追加し、`rapidIntegrityDecline`が拠点IDに依存せず座標のみから動的に評価されることを確認
- dev serverで`/sites`を再確認し、グリッド化後も既存3拠点の表示(「5基準中3基準」、rapidIntegrityDeclineが未評価リストから外れている)が変わらないことを確認済み
- 全389件のテストがgreen、`tsc --noEmit`もクリーン
