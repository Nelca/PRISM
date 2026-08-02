# フェーズ0残タスクの実行計画:LOI獲得・主要係数ライセンス確認

**目的:** ADR-0002(`docs/decisions/0002-phase0-continuation-gate.md`)が「未達」とした条件3(LOI 3件以上)・条件4(主要係数の商用利用の目処)について、AIが調査・下書き作成まで行い、**人間にしかできない作業(実際の連絡・契約締結)のみを残す。**
**最終更新:** 2026-08-02

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
- 日本国内の研究地点カバレッジ数は公開情報からは確認できず、データベースの検索インターフェースへの直接アクセスが必要(このセッションではアクセスできなかった)
- 連絡先:esvd@fsd.nl

**送信可能な問い合わせメール下書き:**

```
To: esvd@fsd.nl
Subject: Commercial partnership inquiry + Japan coverage question (ESVD)

Dear ESVD / FSD team,

We are developing PRISM, a SaaS product for Japanese companies to
quantify nature-related financial risk (water, land use, biodiversity)
using benefit-transfer methodology. We would like to use ESVD as one of
several monetization methods, applied to individual company sites in Japan.

We understand from your terms of use that commercial use requires becoming
a strategic partner. We would appreciate information on:

1. What "strategic partner" status entails commercially (fee structure,
   scope of use permitted, whether individual-record benefit transfer for
   a paid product's outputs is included).
2. How many ESVD study records are based on sites in Japan or the
   broader East Asia region, to help us assess data coverage for our use case.
3. Whether programmatic/bulk access to individual records is available,
   or only manual database search.

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
Subject: Licensing inquiry - Environmental Prices Handbook coefficients in a commercial product

Dear CE Delft team,

We are developing PRISM, a SaaS product for Japanese companies to
quantify nature-related financial risk. We would like to use coefficients
from your Environmental Prices Handbook (e.g., shadow prices for pollutants)
as one of several monetization methods embedded in our paid product's output.

Could you confirm in writing:

1. Whether commercial embedding of specific Environmental Prices
   coefficients into a paid SaaS product's client-facing output is
   permitted, and under what terms (attribution only, licensing fee,
   or a formal agreement).
2. If a formal license is required, the process and cost for a
   Japan-based early-stage startup.

We would welcome a written response or a call to discuss. Thank you.
```

**人間による対応が必要:** メール送信、条件確認、必要であれば有償ライセンス契約。

---

### 1.4 IFVI(Global Value Factor Database)

**調査結果:**
- **唯一、条項が明確。商用利用には事前の書面同意と有償ライセンスが必須**であることが利用規約に明記されている("You must not access or use for any commercial purposes... without IFVI's prior written consent"、"licensing charges apply"という第三者コメントも確認)
- 連絡先:contact@ifvi.org

**送信可能な問い合わせメール下書き:**

```
To: contact@ifvi.org
Subject: Commercial licensing inquiry - Global Value Factor Database (Water Consumption methodology)

Dear IFVI team,

We are developing PRISM, a SaaS product for Japanese companies to quantify
nature-related financial risk in alignment with TNFD/SSBJ disclosure
requirements. We would like to embed value factors from your Water
Consumption Topic Methodology (VFnutrition, VFdisease, VFes, VFaccess)
into our paid product's client-facing output.

Per your Terms of Use, we understand this requires your prior written
consent and a commercial license. Could you share:

1. The licensing process and typical terms for a startup SaaS product
   at pilot stage (3-5 design-partner customers in year one).
2. Fee structure for embedding methodology-derived value factors
   (not raw IFVI content) into client-facing outputs.
3. Whether a pilot/evaluation license is available before a full
   commercial agreement.

We would welcome a call to discuss. Thank you.
```

**人間による対応が必要:** メール送信、ライセンス交渉・費用確定。**この4件の中で最も条件が明確なため、優先的に連絡することを推奨。**

---

### 1.5 全体まとめ

| ソース | 状況 | 優先度 | 次の人間アクション |
|---|---|---|---|
| IFVI | 条件明確(有償ライセンス必須) | 高(条件が明確、話が早い) | メール送信→ライセンス交渉 |
| WDPA(IBAT) | 料金体系公開済み、交渉余地あり | 高(コスト高、早期の条件交渉が必要) | メール送信→料金交渉 |
| ESVD | 個別交渉必須、条件不明 | 中 | メール送信→パートナー条件確認 |
| CE Delft | 条件不透明、書面確認が必須 | 中 | メール送信→書面確認取得 |

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
