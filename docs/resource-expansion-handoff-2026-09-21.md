# 資源・生態系拡張の残件と必要な協力（2026-09-21）

> 追加指示への対応: 実データ待ちを解除し、公開資料と合成データで実装。[研究データの取得・組込記録](research-data-implementation-2026-09-21.md)を参照。

ユーザー確認: 送粉・種の顧客データ、IFVI・CE Delft・ESVDの許諾資料は手元にない（2026-09-21）。未取得を完了扱いにしない。

## 今回追加した機能

- 資源対策に評価期間1〜50年、割引率0〜100%、対策単体のNPV承認ライン、根拠を保存。初期支出を開始時に一度控除し、一定の年間削減額を各年末で割引。ゼロ割引・負の削減額にも対応。各年の現在価値を展開表示する。
- 「対策と判定」に資源対策の比較を追加。同じ拠点の既存案件を明示的に選択し、期間・範囲・費用重複の確認理由を保存できる。案件の前提変更・削除後は対応の再確認まで資源対策のNPV表示を保留する。
- 物理指標の文案に、PDF取込等の既存主張を選択して関連付けできる。原文・抽出された期間／範囲／数量を表示し、人の照合を記録する。主張の変更・削除で下書き出力を停止する。
- 主張・案件の確認はトランザクション内でも照合する。入力中の競合ではイベントも結果も保存しない。JSONBのキー順序が変わっても同じ内容を同じ版として扱う。
- 統合管理の「再確認」対象に、既存主張・投資案件との対応確認を追加する。

既存M6案件への金額合算や承認確定、M5自然債務の算定を追加したわけではない。自社費用の差を環境被害額として扱わない。紐付けだけでM7の自動指摘を解消しない。確認主体・権限は既存アプリのテナント／操作記録方式を使い、独立した承認者ロールは追加していない。

## 実データを受け取るための最小依頼

最初から全顧客分は不要。次のいずれかの実案件を1つ選んで、担当者から資料を取得してください。匿名化した社内検証用でも可。数値例を実データの代用にはしない。

### 生物・鉱物資源（購買・生産・財務担当）

1. 拠点、対象年、品目・規格、供給地、供給者、年間購入量と実際の投入量、単位、一次材／再生材の区分、歩留まり。
2. 現在・対策後の単価と年間費用、初期投資、契約／見積の根拠、適用期間。
3. 対応する投資案件、基準NPVに既に含む費用・削減額、追加費用、割引率、期間、承認ライン。項目ごとに二重計上の有無を財務担当が確認。
4. 環境影響の貨幣化には、購入量から資源採取等の基本フローへ対応させるLCAインベントリ、含有率、供給地、採取方法、対象境界と根拠が必要。

手元のLIME3 CSVを調査した。陸域資源72行（生産国日本の統合係数あり52行）、生物系4行（同1行）が存在する。生物系にはバイオマス、再造林有無を区別した日本の木材、ラテックスがある。**購入した製品1tと天然資源の採取1tは同一と証明されていない**ため、現在の購買量へ直結しない。

調査原本: `docs/data/external/aist-idea-lime3-v4.0-lcia-coefficients.csv`。SHA-256: `63e1744476fc33fb741e176bcea94f0e9dbd5c757a48e9aa620f70d22a959844`。既存ライセンスの記録は `docs/data/lime3-coefficients-notes.md`。係数の存在確認は適用承認を意味しない。

### 送粉（農業・調達担当）

- 対象作物と品種、農地境界、所在地、栽培・収穫期間、面積。
- 収量と単位、収穫価格または粗利、栽培方法、送粉管理方法。
- 当該作物・地域に適用可能な送粉依存度の出典、調査条件、上下限。
- 比較したい対策と費用、比較対象年度、天候等の交絡要因。

### 種の状態（環境調査担当）

- 対象種の学名、調査地点／境界、日付、調査方法、調査努力量。
- 個体数・占有率など採用する指標の定義と単位、基準調査との比較可能性。
- 検出されなかった場合に「不在」と解釈してよいか、検出確率・欠測の扱い、調査担当者の確認。

`docs/decisions/0004-category-expansion-scope.md` の判断どおり、具体的な作物・農地・収量なしで汎用の送粉カテゴリは実装しない。公開研究の平均値を顧客実績として補填しない。データ取得後に当該ケースに合った指標・取込・比較検証を実装する。

## 外部照会：送信に必要な情報

以下の照会本文は準備済み。ユーザーに必要なのは **送信名義・所属・返信先メール・利用するメールサービスと、下記3先への送信指示**。APIキーやパスワードの共有は不要。送信指示後にブラウザーで入力・送信まで進められる（CAPTCHA・契約同意はその場で確認）。有料契約や利用条件への同意は別に確認する。現時点では未送信。

### IFVI

窓口: https://ifvi.org/contact-us/ （名前・メール・本文・CAPTCHA）。以前の資料にある `contact@ifvi.org` は今回の現行窓口ページで再確認できていないため、公式フォームを優先する。移管中の案内があるため、現在の担当窓口も照会する。

Subject: Commercial SaaS licensing inquiry — Global Value Factor Database

We are developing PRISM, a product for companies to evaluate nature-related impacts and compare mitigation measures. We would like written guidance on licensing the Global Value Factor Database and the Air Pollution, Water Pollution, Waste, and Land Use and Conversion methodologies for a commercial SaaS product.

May we store selected factors in an access-controlled database, calculate client-specific results, and display derived results with source/version metadata, without redistributing the factor tables? Please provide the applicable terms, attribution requirements, evaluation options, fees, update requirements, and current licensing contact following the transition to Capitals Coalition. This is an inquiry only; we are not accepting a paid service or license at this stage.

### CE Delft

宛先: `vries@ce.nl`（公式の担当者）。

Subject: Licensing inquiry — Environmental Prices Handbook 2024 EU27 v1.1

We are developing PRISM, a commercial product for nature-related impact assessment. Could you confirm in writing whether we may extract selected coefficients from the Environmental Prices Handbook 2024 EU27 v1.1, store them in an access-controlled database, and use them for client calculations in paid SaaS?

We intend to show derived results and audit metadata, not redistribute the tables. Please clarify conditions for mapping to Japanese PRTR substances, documenting geographic transfer, attribution, errata and updates, and any fees or license agreement required. This is an inquiry only and does not authorize a purchase.

### ESVD / FSD

宛先: `esvd@fsd.nl`。

Subject: Commercial partnership inquiry — ecosystem-service valuation in PRISM

We are developing PRISM, a commercial product for nature-related impact assessment. We would like to understand the strategic-partner terms for using selected ESVD records in site-specific ecosystem-service valuation.

Please clarify fees, permitted internal storage and bulk/API access, derived client results, modification/value-transfer rights, attribution and update requirements, and whether public reporting is required for confidential client work. Please also provide coverage information for Japan/East Asia by ecosystem, service, method and year. This is an inquiry only; we are not accepting partnership or payment terms at this stage.

### 確認した一次資料（2026-09-21）

- [IFVI利用条件](https://ifvi.org/terms-of-use/): 商用利用には事前書面同意を求める。条件確認待ち。
- [IFVI窓口](https://ifvi.org/contact-us/): 問い合わせフォーム、Capitals Coalitionへの移行案内。
- [CE Delft v1.1公開ページ](https://cedelft.eu/publications/environmental-prices-handbook-2024-eu27-version/): 2025年4月訂正、正誤表、担当者。商用組込許諾は未確定。
- [ESVD利用条件](https://www.esvd.info/terms-and-conditions): 商用は別条件・strategic partner、改変等に事前書面同意。問い合わせだけで許諾取得と扱わない。

回答が来たら、原文と取得日・許諾対象・表示条件・費用・期限を保存し、係数原本の版と対応表をレビューしてから有効化する。

## 完了状態

| 残件 | 現在 | 再開に必要なもの |
|---|---|---|
| 資源対策の複数年費用・判定 | 実装・検証 | 実案件への適用には財務根拠 |
| 既存主張・M6案件との明示的関連付け | 実装・検証 | 人が根拠と対応範囲を確認して使用 |
| M5自然関連財務影響・既存案件への追加金額反映 | 未完了 | 基本フロー対応と財務経路・既計上項目の実案件レビュー |
| 送粉・種の評価 | 未完了 | 上記の実案件・調査データ |
| 外部係数の顧客向け有効化 | 未完了 | 送信名義・送信指示、提供元の回答・必要契約 |

## 検証結果

- 通常テスト132ファイル・857件成功。型検査、ESLint、本番ビルド成功。
- 関連DBテスト4ファイル・22件成功。専用テナントで保存・不正入力拒否・主張／案件照合・再実行を検証。
- 専用の `portfolio-ui-test` で3年・割引率5%の対策を保存。年間削減20万円・初期費用30万円に対しNPV約24.465万円が表示され、対策一覧と案件リンクへの反映を確認。
- 既存主張を選択すると原文・期間・範囲・数量・照合確認欄が表示されることを実画面で確認。主張の変更・削除による出力停止は通常テストで、主張リンクの保存はDBテストで検証。
- 実画面の主張は水に関するものだったため、木材の指標へ対応済みとは保存していない。ユーザーの実テナントに検証データは追加していない。
