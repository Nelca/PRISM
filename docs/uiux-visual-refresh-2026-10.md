# 視覚化リデザインと全画面UIレビュー（2026-10-03）

## 目的と依頼

2026-10-03 時点でのユーザー依頼は2件。

1. 文字が多く視覚的に分かりにくい。図・グラフ・色付き表を増やし、初見ユーザーが「何ができるか」を掴めるようにする。独自発明より既存SaaSのUI/UXをトレース。プロダクト全体で統一する。
2. 添付画像のような「文字とボタンの重なり」等の初歩的なUI崩れを全画面レビューで無くす。

## 決定事項

### 依存追加
lucide-react(v1.50.0)のみ。グラフは既存の自作SVG方式を踏襲。

### 参照SaaS
Watershed / Persefoni(環境会計) + Stripe Dashboard / Linear。

### CSS戦略
globals.css は全面的に重複を整理する。

## 参照したSaaSパターンと出典

調査エージェントが実際に参照したURL。

| 出典 | 参照した内容 |
| --- | --- |
| https://github.com/voltagent/awesome-design-md/blob/main/design-md/linear.app/DESIGN.md | Linear の配色・余白・バッジの数値 |
| https://mobbin.com/glossary/status-dot | ドット付き状態バッジ |
| https://www.setproduct.com/blog/badge-ui-design | バッジの形状・色の使い分け |
| https://npm.tremor.so/docs/ui/badges 、 https://www.tremor.so/docs/visualizations/progress-bar | バッジ・進捗バーの寸法 |
| https://watershed.com/platform/measure | カバレッジ・内訳バー・目標対実績の見せ方 |
| https://www.persefoni.com/blog/enhanced-dashboards 、 https://www.persefoni.com/business/decarbonization-management | ダッシュボードのタイル構成・目標追跡 |
| https://artofstyleframe.com/blog/dashboard-design-patterns-web-apps/ | Stripe / Linear / Vercel 系ダッシュボードの共通構成 |

## 共通部品キット

### 追加した部品

app/components/viz.tsx + app/styles/viz.css（Server Component）に実装。

| 部品 | 役割 | トレース元 |
| --- | --- | --- |
| StatGrid / StatTile | 数値+ラベル+補助のKPIタイル。全体がリンク | Stripe Dashboard の metric card |
| StatusBadge | ドット付きの状態ピル(完了/進行中/要対応/保留、判定、Tier) | Linear の status pill |
| RatioBar | 分母≤20 は等幅セグメント、>20 は連続バー。数値を併記 | Watershed の coverage 表示 |
| ProgressRing | SVG の進捗リング。40px 未満は文字を外側に出す | Watershed の coverage 表示 |
| RangeBar | p5–p50–p95 の行内帯。承認ラインの破線。またぐ=warn / またがない=ok を自動判定。承認ライン未入力は threshold を渡さない | 既存 Football チャートの行内版+財務の football-field 慣行 |
| BreakdownBar | 積み上げ内訳。最大6色。凡例は表に1回 | Watershed の emissions breakdown |
| HeatCell | 順序尺度5段のセル。未登録は斜線で「0」と区別 | Watershed / Persefoni の data coverage 行列 |
| TargetBar | 実績・目標・基準を1本のトラックに。達成=緑、未達=赤茶、未入力は「未入力」 | Watershed の targets ページ |
| Stepper | 6工程のノード+接続線。デスクトップ横、767px 以下で縦 | Linear / Stripe の onboarding stepper |
| FeatureGrid / FeatureCard | アイコン+見出し+1行説明の機能カード | Stripe / Linear の docs home |
| EmptyState | アイコン+1文+主操作1つ | Linear / Stripe の空状態 |
| ActionRow | ボタン・リンクの行。折り返しと間隔を保証 | 共通ルール(重なり防止) |

### アイコン辞書

app/components/icons.tsx に定義。

- STAGE_ICON: Factory / ListChecks / Calculator / TrendingDown / Gavel / FileText
- SCREEN_ICON: Compass / Target / ClipboardClock / FileSearch / Archive
- CATEGORY_ICON: Droplet / Cloud / TriangleAlert / Trash / Mountain / Leaf
- STATUS_ICON: CircleCheck / CircleDot / CircleAlert / CirclePause
- ACTION_ICON: ArrowRight / Plus / Upload / Download / Search / Inbox / Scale
- iconForHref(): href の先頭セグメントから工程/画面アイコンを引く(ナビ・ヘッダー・ステッパーで共用)

### トークン追加

globals.css の :root に追加。

| トークン | 値 | 用途 |
| --- | --- | --- |
| --ok | #2f7d4f | 達成・承認・OK |
| --ok-soft | #e5f3ea | OK の背景 |
| --ok-line | #bfe0cc | OK の枠線 |
| --tierA-soft | #e4ecf8 | Tier A 背景 |
| --tierC-soft | #eaeae7 | Tier C 背景 |
| --seq-0..4 | accent-soft / #cfe0fb / #9cc4f0 / #2f7cd6 / accent | 順序色 5段(薄→濃) |
| --space-1..6 | 4/8/12/16/24/32px | 余白 |

TagVariant に accent / pending を追加。.tag--ok を青→緑に変更。verdictTagVariant の pending を neutral→pending(金)に変更。

## ボタンと本文の重なりの根本原因と修正

### 原因

`.pill-btn` が `<a>` のまま inline 表示で、縦 padding がレイアウト幅を持たなかった。3世代の定義が積層していた。

### 修正内容

```
.pill-btn { 
  display: inline-flex; 
  align-items: center; 
  gap: 6px; 
  line-height: 1.25 
}
.card__body > * + * { 
  margin-top: var(--space-3) 
}
.card__body > .action-row { 
  margin-top: var(--space-4) 
}
```

`<p>` 直後の裸の pill-btn は ActionRow に置換。対象: ホーム、ガイド、公開データ、統合管理詳細ほか。

## globals.css の統合

### 前後の数値

| 項目 | 前 | 後 | 備考 |
| --- | --- | --- | --- |
| 行数 | 3,504 | 2,667 | 統合直後。その後トークン・ボタン修正で若干増 |
| トップレベルルール | 579 | 441 | 重複削除 |
| 重複セレクタ（上書き衝突） | 78(66) | — | 後で意図的な重複を分別 |
| @media ブロック | 16 | (位置を保ったまま正規化) | ブレークポイント統一 |
| 未使用ルール削除 | — | 106件 | 実質削減量 |
| residual 重複 | — | 31→52 | 意図的に残置（詳細は memory/prism-css-consolidation-and-ui-audit.md） |

### ブレークポイント正規化

- 前: 1023/1100/860/767/760/700/420 が混在
- 後: 1023 / 767 / 420 の3段に統一
  - 860・1100 → 1023
  - 700・760 → 767

### 検証方法

33ルート × 3幅(1440/768/390) = 99ケースの全要素 computed-style ハッシュを統合前後で比較し、**差分0** を確認してから適用。

### 回帰した4ケース

単純な後勝ちマージで4回回帰。その都度スクリプト修正。

1. body font-size: 15→14
2. nav 色
3. ボタン枠色
4. 390px サイドバー

## 画面別の変更

### ホーム、ガイド、ナビゲーション

- ナビ・ヘッダーにアイコン
- ホーム冒頭3段を FeatureCard
- 「全体の流れ」に状態連動 Stepper
- 工程 Tag → StatusBadge
- 結果チェーンを StatGrid + StatTile（+ RatioBar）
- 財務表の判定を StatusBadge
- ガイド: Stepper(compact)、成果物3枚と規律5項目を FeatureCard、年間サイクル4列

### 統合管理

- サマリー4件を stat-tile + ProgressRing
- カバレッジ行列を HeatCell(未登録は斜線) + 列見出しにカテゴリアイコン
- 一覧の状態を StatusBadge
- 実績/目標を TargetBar
- 詳細に StatGrid + TargetBar
- 取込/登録の完了メッセージボタンを ActionRow

### 評価対象、価値算定、分析、根拠

- 評価対象に StatGrid
- 優先度4要素を BreakdownBar(凡例1回)
- 評価の深さを StatusBadge
- 感度分数を RatioBar
- 価値算定: 代表値選択 ProgressRing
- 算定方法表に Tier StatusBadge と RangeBar(同表で min/max 共通)
- 分析の結論3値を StatTile
- 寄与分解に BreakdownBar
- 根拠の状態語を StatusBadge

### 財務影響、対策と判定

- 財務に StatGrid(自然債務合計・減損リスク拠点・利益影響最大)
- 拠点表に impact バー・減損リスク StatusBadge
- 拠点詳細に StatTile 3枚
- 判定に StatGrid(判定確定 RatioBar・超過件数・未反映件数)
- 判定結果に **RangeBar + 承認ライン**(保留時は threshold を渡さず pending 色)
- 対策比較表に投資額 RatioBar と NPV RangeBar(全候補で軸共通)

### 開示、記録、拠点、公開データ

- 開示入口3枚、記録入口4枚、拠点の取込4種を FeatureCard
- 指摘種別と対応状況を StatusBadge
- 根拠確認の進捗 ProgressRing
- 指摘0件 EmptyState
- 拠点一覧の座標解決を StatusBadge
- /sites/import/prtr の横はみ出し(改修前から存在)を縮小耐性CSSで修正
- 公開データの仮定値を StatTile 併記

## 全画面QA

### 方法

public/prism-tools.js(一時)の `__prismAudit` を同一オリジン iframe で実行。

- 実行: 33ルート × 3幅(1440/768/390) = 99ケース
- 検出項目:
  - 祖先関係にないテキスト/操作要素の矩形交差(>4px×4px)
  - 横はみ出し(scrollWidth>clientWidth かつスクロール不可)
  - nowrap + overflow:hidden の切れ
  - ビューポート外への突出
  - ページ全体の横スクロール

### 改修前（基準値）

- 重なり検出があるケース: 44/99
- ページ全体の横スクロール: 7ケース(/sites/import/prtr 全幅、/assessment 390/768)
- 突出: /sites 390px(22要素)・/sites/import/prtr(4要素)

注: 当初の検出には閉じた <details> 内の要素・折返し中の inline 要素・SVG 文字が含まれており、同じ除外条件で再集計すると実数はこれより少ない。

### 統合後の推移

| 段階 | 重なり検出ありのケース | ページ横スクロール | 突出 |
| --- | --- | --- | --- |
| 画面変更の統合直後(除外条件なし) | 39/99 | 5/99 | — |
| 誤検知除外+共通修正後(最終) | 0/99 | 0/99 | 0/99 |

最終状態で残るのは横はみ出し 3〜4px の3ケース(下記)のみ。

### 除外条件と共通修正

誤検知除外：
- 閉じた details 内
- 同一ブロック内で折り返した inline 同士
- SVG 文字
- clip で隠した要素

共通修正の内容：

```
.pill-btn { display: inline-flex }
.card__body > * + * { margin-top: var(--space-3) }
.card__body > .action-row { margin-top: var(--space-4) }
.sr-only / .file-input__control { left: 0; top: 0 }
.grid-2 / .grid-3 / .field-row > * { min-width: 0 }
.field input / select / textarea { max-width: 100%; box-sizing: border-box }
.field label { overflow-wrap: anywhere }
.kv__v { min-width: 0; overflow-wrap: anywhere }
表を包む div/section { 横スクロール単位に }
.home-result-panels { minmax(0, 1fr) }
ホームのヒーロー右余白 { 56px(デスクトップ) / 48px(モバイル) 確保 }
Stepper の接続線 { 要素内の左右半分で描画 }
StatGrid の列数指定 { 768px 以上限定 }
小さい ProgressRing { 文字を外側に }
RatioBar { 折返し可に }
FeatureGrid / StatGrid の minmax { min(Npx, 100%) に }
```

### 残存3ケース

最終段階で残存：横はみ出し 3～4px（目に見えない内部スクロール量）

| 画面 | 幅 | 内容 | 値 |
| --- | --- | --- | --- |
| /valuation | 390 | kv 行 | 323 > 320 |
| /research | 390 | 入力欄 | 328 > 324 |
| /research | 390 | label | 160 > 156 |

### 目視確認

- 1440px: 全主要画面、ステッパー・カード・重なり確認
- 375px(モバイル): ホーム、統合管理、対策と判定を確認
  - ステッパーは縦積み
  - カードは1列
  - 重なりなし

### 未実施項目

実ユーザーによる初見理解の評価。

注: `/sites/import/prtr` の G-E による防御的CSS は残しているが真因は `.file-input__control` の静的位置だった。

## 検証

### TypeScript / ESLint

typecheck 0エラー、eslint(app lib) 0エラー。

### Vitest

134ファイル・881テスト合格。

### 全体 npm run lint

tools/promotion/*.cjs の既存エラー7件(require()禁止)で失敗。今回の対象外で未修正。

### DBテストと本番ビルド

DBテスト(`npm run test:db`): 10ファイル・55テスト合格。本番ビルド(`npm run build`): 成功(全ルート動的レンダリング)。

## 第2回レビュー(同日、ユーザー指摘を受けて)

ユーザーから「細かいUI崩れが残っている」との指摘(価値算定の KPI タイルと切替ボックスの密着、ホームのステッパー注記のはみ出し、評価対象の「評価の深さ」列の詰まり、リング表示の数値重複)を受け、全33ルートを 1440px で目視し直し、以下を修正した。

| 箇所 | 症状 | 修正 |
| --- | --- | --- |
| KPIタイル群・機能カード群・ステッパーの直後 | 次のカードや切替ボックスと密着 | `.screen :is(.stat-grid, .feature-grid, .stepper) + *` に 16px の上余白 |
| ホーム/ガイドのステッパー注記 | 長い注記が列幅を超えて左右にはみ出す | `.stepper__label` を幅100%・`overflow-wrap: anywhere` に |
| 価値算定・開示の KPI タイル | 値「4/4」とリング内の「4/4」が重複 | `ProgressRing` に `showText` を追加し、タイル内では非表示 |
| 評価対象「評価の深さ」列 | バッジと切替ボタンが隙間なく並ぶ | `.val-depth` で縦積み・6px 間隔 |
| ホーム「登録データから得られた結果」 | 6枚のタイルが5+1に割れる | `StatGrid columns={3}` |
| 統合管理の指標詳細 | 文章の値(「比較基準値・実測値が必要」)が26pxで表示 | 9文字以上の文字列値は `stat-tile__value--text`(15px)に |
| ガイドの年間サイクル | Q1〜Q4 のバッジがカード幅いっぱいに伸びる | `align-self: flex-start` |
| 記録「入力・係数」 | ハッシュ列が横スクロールで切れて見える | `table.data-table td .num { overflow-wrap: anywhere }` |
| 公開データ画面のヘッダー | ルート名が「ダッシュボード」になる | `ROUTE_TITLES` に `/research` を追加 |

再実行した自動検出(33ルート×3幅=99ケース)は重なり 0、ページ横スクロール 0、突出 0。残存は改修前と同じ目に見えない内部スクロール2ケース(/valuation 390px の kv 行 323>320、/research 390px の入力欄 328>324)。

## 未実施事項・留意点

- 実ユーザーによる初見理解の評価は未実施
- `/sites/import/prtr` の横はみ出し(改修前から存在)を縮小耐性CSSで修正したが、真因は `.file-input__control` の静的位置だった
- 残存3ケースの横はみ出し（3～4px、目に見えない内部スクロール量）は許容とした
- 進捗リングのクラス名は `.progress-ring`。当初の `.ring` は Tailwind v4 の同名ユーティリティ(`box-shadow` による輪郭線)が当たり、リングの周りに枠線が出た。`@import "tailwindcss"` が有効なため、部品のクラス名は Tailwind のユーティリティ名と重ねない(`.collapse` と同じ注意)。
- 作業用の一時ファイル(`public/prism-tools.js`、`public/prism-routes.txt`、`.claude/launch.json`)は削除済み。検出スクリプトの手順は memory に記録。
- git commit は行っていない(ユーザーがレビュー後にコミットする運用)。
