# フェーズ0残タスクの実行計画:LOI獲得・主要係数ライセンス確認

**目的:** ADR-0002(`docs/decisions/0002-phase0-continuation-gate.md`)が「未達」とした条件3(LOI 3件以上)・条件4(主要係数の商用利用の目処)について、AIが調査・下書き作成まで行い、**人間にしかできない作業(実際の連絡・契約締結)のみを残す。**
**最終更新:** 2026-08-28(IFVI/CE Delft/ESVDを算定対象拡大向けに更新。いずれも未送信)

---

## 1. 主要係数のライセンス確認

調査の結果、4つの係数ソースすべてで**人間による直接の問い合わせ・交渉が必須**であることが判明した(自動契約・セルフサーブ完結の経路はない)。以下、それぞれの状況と、送信可能な問い合わせメール下書きを用意した。

### 1.1 WDPA(IBAT Alliance経由)

**調査結果:**
- セルフサーブの契約完結は不可。無料アカウントは即時作成できるが、商用サブスクリプション・API利用は個別問い合わせが必須
- 料金体系(公開済み):Free($0)/ Basic($5,000/年)/ Pro($15,000/年)/ Enterprise($25,000/年、複数年契約で割引)/ **Enterprise Plus($35,000/年、API連携が可能な唯一のプラン)**
- PRISMのような「顧客拠点を随時スクリーニングする埋込利用」には、API連携が可能なEnterprise Plusが必要と考えられる。**スタートアップにとって初年度から$35,000/年は重い。個別交渉の余地(段階的な利用量に応じた料金、パイロット期間の割引等)を打診すべき**
- 連絡先:ibat@ibat-alliance.org、デモ申込フォーム(ibat-alliance.org/pricing)

**送信可能な問い合わせメール下書き:**

```
To: ibat@ibat-alliance.org
Subject: Commercial API inquiry from a Japan-based TNFD/SSBJ disclosure SaaS startup

Dear IBAT Alliance team,

We are developing PRISM, a SaaS product for Japanese companies to quantify
and disclose nature-related financial risk in alignment with TNFD and Japan's
SSBJ climate/nature disclosure requirements. As part of our Locate phase
(TNFD LEAP), we need to screen client operational sites against protected
area data (WDPA) programmatically, embedded within our own paid product.

We understand from your public pricing page that API access requires the
Enterprise Plus tier. As an early-stage startup currently in a pilot phase
(3-5 design-partner customers expected in our first commercial year), we
would appreciate the opportunity to discuss:

1. Whether a phased or startup-adjusted pricing arrangement is available
   for our pilot phase, given our initial usage volume will be limited
   to a small number of enterprise customers' sites.
2. The specific commercial terms for embedding WDPA overlap results
   (not raw WDPA data) into our own product's output for paying customers.
3. Typical onboarding timeline for API access.

We would welcome a call to discuss further. Thank you for your time.
```

**人間による対応が必要:** 上記メールの送信、その後の商談・契約交渉、料金の最終確定。

---

### 1.2 ESVD(FSD経由)

**調査結果:**
- サイト全体の一般ライセンスはCC BY-NC 4.0だが、**商用利用は別条件で「ストラテジックパートナー」になる必要がある**と明記
- 日本関連レコードは67件まで確認済み。ただし海洋/陸域、サービス種類、評価年代が混在するため、土地案件への実用カバレッジは別途再集計が必要
- 連絡先:esvd@fsd.nl

**送信可能な問い合わせメール下書き:**

```
To: esvd@fsd.nl
Subject: Commercial partnership inquiry - land use and ecosystem-service valuation in Japan

Dear ESVD / FSD team,

We are developing PRISM, a paid SaaS product for Japanese companies to
quantify nature-related financial impacts. We are preparing a land-use and
land-conversion module that applies benefit transfer to individual company
sites and development projects in Japan. We would like to use ESVD as one
of multiple valuation methods, alongside LIME3 and IFVI where licensed.

We understand from your terms of use that commercial use requires becoming
a strategic partner. We would appreciate information on:

1. What "strategic partner" status entails commercially (fee structure,
   scope of use permitted, whether individual-record benefit transfer for
   a paid product's outputs is included).
2. Whether we may store selected records in an access-controlled internal
   database and show only derived client results, not the source records.
3. Whether programmatic/bulk access or an API is available, and how updates
   and versioning are communicated.
4. Coverage in Japan/East Asia by terrestrial ecosystem type, ecosystem
   service, valuation method, and study year. We have identified 67 records
   associated with Japan, but need to assess their fitness for land projects.
5. Whether any public-reporting requirement applies to confidential client
   work performed under a commercial partnership.

We would welcome the opportunity to discuss further. Thank you.
```

**人間による対応が必要:** メール送信、ストラテジックパートナー条件の交渉、日本カバレッジが薄い場合の代替データ源(環境省・林野庁の公的評価値)への切替判断(build-plan §3.4に既定路線あり)。

---

### 1.3 CE Delft(環境価格ハンドブック)

**調査結果:**
- 明確な商用ライセンス条項がウェブ上で確認できず、**状態が最も不透明。** 標準的な著作権(無断利用不可が原則)が適用されている可能性が高いが、書面での確認が必須
- 連絡先:ce@ce.nl

**送信可能な問い合わせメール下書き:**

```
To: ce@ce.nl
Subject: Licensing inquiry - Environmental Prices Handbook 2024 v1.1 coefficients in commercial SaaS

Dear CE Delft team,

We are developing PRISM, a paid SaaS product for Japanese companies to
quantify nature-related financial impacts. Our first pollution module will
use facility-level releases of hazardous chemicals reported under Japan's
PRTR scheme. We are evaluating the Environmental Prices Handbook 2024 EU27
version 1.1 as a second valuation method alongside Japan-calibrated LIME3.

Could you confirm in writing:

1. Whether we may extract specific Annex coefficients into an internal
   database and use them in calculations within a paid SaaS product.
2. Whether we may show derived client results and audit metadata without
   displaying or redistributing the coefficient tables themselves.
3. Terms for mapping the coefficients to Japanese PRTR substances and
   applying documented geographic adjustments to EU27-average values.
4. Required attribution, version/erratum handling, fees, and contract process
   for a Japan-based early-stage company in a pilot phase.

We would welcome a written response or a call to discuss. Thank you.
```

**人間による対応が必要:** メール送信、条件確認、必要であれば有償ライセンス契約。

---

### 1.4 IFVI(Global Value Factor Database)

**調査結果:**
- 提供済みWater Consumption PDFのContent Termsでは個人・非商用利用が基本で、製品販売・公開報告・商取引での利用および第三者アクセスが制限される。PRISMの商用SaaS利用可否・料金は書面確認が必要
- Air Pollution、Water Pollution、Waste、Land Use and ConversionはWater Consumption PDFとは別資料・別モデルで、Global Value Factor Databaseも別途取得が必要
- 連絡先:contact@ifvi.org

**送信可能な問い合わせメール下書き:**

```
To: contact@ifvi.org
Subject: Commercial licensing inquiry - Global Value Factor Database and interim environmental methodologies

Dear IFVI team,

We are developing PRISM, a paid SaaS product for Japanese companies to quantify
nature-related financial impacts in alignment with TNFD and related reporting.
We currently evaluate Water Consumption and are expanding to pollution,
waste, and land use. We would like to evaluate and, if licensed, use the
Global Value Factor Database and the following interim methodologies and
models: Air Pollution, Water Pollution, Waste, and Land Use and Conversion.

We already have the final Water Consumption Topic Methodology PDF, but
understand that it does not contain the methods or value factors for these
additional topics. Per the Content Terms, we also understand that product
embedding and commercial use require written confirmation. Could you share:

1. The licensing process and typical terms for a startup SaaS product at
   pilot stage (3-5 design-partner customers in year one).
2. Whether a single license can cover the Global Value Factor Database and
   all four interim topics listed above.
3. Whether we may store selected value factors in an access-controlled
   internal database and show only derived results, methodology/version,
   and audit metadata to clients without redistributing raw IFVI content.
4. Whether a pilot/evaluation license is available, and the boundary between
   internal evaluation, advisory use, and commercial SaaS use.
5. Registration, user-access, attribution, versioning, and update conditions.

For methodology questions, we can also coordinate with research@ifvi.org.
We would welcome a call to discuss. Thank you.
```

**人間による対応が必要:** メール送信、ライセンス交渉・費用確定。送信後は、回答原文・日付・担当者・許諾範囲を`docs/data/licensing.md`へ転記し、口頭回答だけでプラグインを有効化しない。

---

### 1.5 全体まとめ

| ソース | 状況 | 優先度 | 次の人間アクション |
|---|---|---|---|
| IFVI | 商用SaaS利用は書面確認が必要。追加4テーマは別途取得 | 高(4テーマ横断で照会) | メール送信→許諾範囲・料金交渉 |
| WDPA(IBAT) | 料金体系公開済み、交渉余地あり | 高(コスト高、早期の条件交渉が必要) | メール送信→料金交渉 |
| ESVD | strategic partner契約が必要。日本67件確認済み | 高(土地の第2手法候補) | メール送信→パートナー条件確認 |
| CE Delft | 条件不透明。PRTRに近い500超物質を収録 | 高(汚染の第2手法候補) | メール送信→書面確認取得 |

---

## 2. LOI獲得(3件以上)

### 2.1 調査結果:ターゲット候補企業リスト

TNFD.global公式アダプターリストによれば、日本は世界最大のTNFD採択国(2025年7月時点で全体の約4分の1)。構想書のSOM定義(製造/食品/化学/素材/紙パ/商社)に該当する候補企業を特定した。

| 企業 | 業種 | TNFD関与度の所見 |
|---|---|---|
| 王子ホールディングス | 紙パ | Early Adopter(2024年1月)。専用TNFDレポート公表済み |
| 大王製紙 | 紙パ | 登録済みAdopter。LEAPアプローチ適用中 |
| 日本製紙グループ | 紙パ | 環境省ネイチャーポジティブ・プラットフォームに掲載 |
| 住友化学 | 化学 | Early Adopter(2024年1月、WEF発表と同時) |
| 東レ | 化学・素材 | Adopter、TNFD Forumメンバー |
| キリンホールディングス | 食品 | **最も成熟。2022年からLEAPベースの開示を先行実施** |
| サントリーグループ | 食品 | SBTNパイロット参加、定量化手法を積極的に模索中 |
| 住友商事 | 商社 | TNFD Forumメンバー(2022年)、Early Adopter |
| 丸紅 | 商社 | Forumメンバー(2022年)、Adopter(2024年1月) |
| 大林組 | 建設 | 登録済みAdopter、FY2025開示目標 |

**特に優先度が高い2社:** キリンホールディングス(既に高度な開示実績があり、精緻化ニーズが強い可能性)、サントリーグループ(定量化手法を明示的に模索中、まさにPRISMの価値提案と合致)。

**未確認・要追加調査:** 三菱商事・伊藤忠商事・三井物産(大手商社、一次資料での登録確認が取れず)、住友化学・東レの内部の定量化における具体的な課題感(統合報告書等の読み込みが必要)。

### 2.2 ヒアリングスクリプト(build-plan §3.3を構造化)

```
【インタビュー対象】サステナビリティ/IR部門、可能であれば財務・経営企画部門も同席

1. 直近1年の投資稟議で、環境要因が結論を変えた案件は何件ありますか
2. 社内炭素価格をお持ちの場合、それによって否決された案件はありますか
   (シャドウプライスに留まっていませんか)
3. 手法間で2桁の乖離が出たとき、現状どう1つを選び、どう社内で説明していますか
4. 「この論点は投資判断に効かない」と確定させることに、対価を払う価値があると
   思いますか。予算科目はSSBJ対応予算ですか、投資判断プロセス予算ですか
5. 「分解不能」とシステムが正直に回答することを許容できますか、
   それとも常に単一の数字を求めますか
```

**注記(build-plan §3.3より):** 質問5への反応が全員「数字を1つ出してほしい」だった場合、製品思想が市場と噛み合っていない可能性がある。この兆候は必ず記録すること。

### 2.3 アウトリーチメール下書き(インタビュー依頼)

```
Subject: 【ヒアリングのお願い】自然関連財務情報の定量化に関する研究インタビュー

[会社名] サステナビリティ/IR部門 ご担当者様

突然のご連絡失礼いたします。私共は、TNFD/SSBJ対応における自然関連財務影響の
定量化・投資判断への接続を支援するプロダクト(PRISM)を開発しております。

貴社が[具体的な言及:例 LEAPアプローチに基づく開示を先行実施されている/
定量化手法を積極的に模索されている]ことを拝見し、ぜひ実務上の課題感を
伺いたくご連絡いたしました。

30分程度、以下のようなテーマでお話を伺えればと存じます:
- 環境関連の投資判断において、現状どのように評価手法のばらつきと
  向き合っておられるか
- 「この論点は投資判断に影響しない」と確定させることの実務上の価値

営業目的ではなく、貴社の実務上の課題を伺うことを主目的としております。
ご都合よろしい日時をいくつかいただけますと幸いです。
```

### 2.4 LOI(Letter of Intent)テンプレートの構成要素

正式なLOI文書自体は、ヒアリングを経て個社ごとの合意内容に応じて作成する必要があるため、ここでは**雛形の構成要素**のみ整理する(具体的な条件は商談で確定するため、AIが最終文書を作ることはできない)。

```
1. 前文:PRISMのパイロット参加への非拘束的な意向表明である旨
2. 対象範囲:パイロット期間(例:2027年Q1〜Q2)、対象拠点数、対象カテゴリ(気候・水)
3. 参照価格:board-proposal.md §9の規模区分別価格表を参照(規模に応じたS/M/L/XL区分)
4. 成果物:M1〜M8のうちパイロットで提供する範囲(開示プラン/判断プランの別)
5. 双方の役割:PRISM側(実装・サポート)、顧客側(データ提供・フィードバック)
6. 非拘束条項:本LOIは法的拘束力を持たず、正式契約は別途締結する旨
7. 有効期限
```

**人間による対応が必要:** ヒアリングの実施、関係構築、LOI条件の個別交渉、署名。

---

## 3. 完了条件との対応

| build-plan条件 | 本ファイルでの対応状況 |
|---|---|
| 条件3(LOI 3件以上) | ターゲットリスト・ヒアリングスクリプト・アウトリーチメール・LOI雛形をAIが準備完了。**残るのは人間による実際の連絡・ヒアリング実施・関係構築・署名のみ** |
| 条件4(主要係数のライセンス) | 4件すべてで問い合わせメール下書きを準備完了。**残るのは人間による送信・条件交渉・契約締結のみ** |

**開発(コード実装)は、これらと並行して進めてよい(冒頭の確認事項の通り)。**
