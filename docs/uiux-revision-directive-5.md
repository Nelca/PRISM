# PRISM UI/UX修正指示書 第5版(反映確認+新規発見の機能バグ3件)

**作成日:** 2026-08-17
**位置づけ:** 第4版の後続。ユーザーによる再レビューで「第4版の指摘が直っていない」との報告を受け、原因調査と追加の機能バグ修正を行った記録。再起動後に発生したReact警告(D-20)も本版に追記。
**制約(継続):** `packages/core` 不変。git commitしない。

---

## §0 総評

ユーザーが再レビュー時に見ていたdevサーバーには、**第4版のD-04〜D-14(第2波・第3波)がまだ反映されていなかった。** 実装自体は完了しworktreeに存在していたが、本体チェックアウトへ同期する前にセッションが終了していたため、ユーザーが指摘した項目の大半(概算/詳細評価の説明、算定の対象の重複、課題セレクタの100件対応、比較ペア選択、ウォーターフォールのラベル重なり、財務データ入力位置、カード上下padding、財務用語の説明、④⑤のサマリー先行構成、またぐ/またがないの文言)は**実装済みだが未反映**だった。本版でこの同期を行った(§B)。

同時に、今回の詳細な再調査で、第4版では発見できていなかった**新規の機能バグ2件**が見つかった(§A)。特にD-17は、ユーザーが報告した「代表値変更・財務データ入力でM6 D-3エラーになる」「エラー後にブラウザバックで画面が表示されない」の直接の原因であり、第4版のD-01(検証してから永続化)だけではカバーしきれていなかった箇所だった。

---

## §A 新規に発見した機能バグ(P0・根治)

### 指示 D-17 【P0】「対策を実施せず監視を継続」案がM6 D-3で例外になり、ページ読み込み自体がクラッシュする

- **現象:** 代表値の変更・企業財務データの入力などの操作で「M6 D-3: 深掘り推奨を算出できるValuationRecordがありません(countermeasuresが空か、sourceValuationRecordIdが解決できません)。」というエラーになる。エラー後にブラウザバックしても画面が表示されない。
- **根本原因(調査済み):**
  - 「対策を実施せず監視を継続」案(`lib/demo/company.ts`・`lib/demo/user-site-defaults.ts` の `acceptance` 候補)は回避コストが0円のため `avoidedNatureCost: []` で構成される(対策なし=回避コスト0という正しい設計)。
  - この案のNPVレンジは通常NPVちょうどに退化する(p5=p50=p95=baselineNpv.value、`packages/core/src/decision/nature-adjusted-npv.ts`)。承認閾値がこの値と厳密に一致する入力だと★判定が「またぐ」になる(`evaluateVerdict`)。
  - `identifyDominantAssumption`(M6 D-3、`packages/core/src/decision/dominant-assumption.ts:58`、変更不可)は、★判定が「またぐ」のときだけ呼ばれ、「参照できるValuationRecordが1つもない」場合に `NoContributingRecordError` を投げる。回避コスト0円の対策候補は構造的にこの条件に該当する。
  - この例外は、**Server Action経由の書き込み(`tryRunAndPersist`)では第4版D-01-2の事前検証で捕捉されフォーム内エラーになる**が、**保存済みrunを読み直すだけの経路(`lib/pipeline/execute-run.ts` の `getOrCreateLatestResult` → `executeAndPersistRun`)では捕捉されず、ページ全体がクラッシュしていた。** ページを再訪問する・ブラウザバックする操作も同じ経路を通るため、同じ例外で失敗し続け、「ブラウザバックしても画面が表示されない」という報告と一致する。
- **修正:** `lib/demo/run-demo-pipeline.ts` の対策案プレビュー計算(`countermeasureCandidates`)・最終判定計算(`decision`)を、それぞれ個別に try/catch で保護した。
  1. `NoContributingRecordError` だけを選択的に捕捉する(他の例外——例えば評価期間を超える入力の `HorizonExceededError`——は握りつぶさず再送出し、D-01-2の事前検証が正しく「保存しない」判断をできるようにする。**最初の実装では全例外を捕捉してしまい、既存のD-01-2回帰テスト2件を壊すミスをしたため、この選択的捕捉に直した。**)
  2. 計算できなかった対策案は比較対象から除き、理由を警告として残す(黙って消さない、第4版D-01-3と同じ規律)。
  3. 選択されていた対策案が計算できなかった場合は、既定の対策案にフォールバックし、その旨も警告に残す。
  4. すべての対策案が計算できなかった場合、その拠点の判定自体を計算対象から除き、警告に理由を残す(既存の `!costSourceRecord` パターンと同じ書き方)。
  5. `RESULT_SCHEMA_VERSION` は6のまま(結果の形は変わっていない)。
- **検証:** `lib/demo/representative-selection.test.ts` に回帰テストを追加(承認閾値=通常NPV・対策案「acceptance」選択という具体的な壊れる入力で、例外にならないこと・警告が残ること・判定自体は計算できることを確認)。DBテスト(`lib/pipeline/try-run-with-interaction.db.test.ts`)の既存2ケースが引き続き正しく「保存しない」ことを確認済み(捕捉範囲を誤って広げていないことの回帰確認)。
- **対象:** `lib/demo/run-demo-pipeline.ts`、`lib/demo/representative-selection.test.ts`

### 指示 D-18 【P0】「対策案の比較」散布図が意味をなさない(NPV指標が絶対値でスケール崩壊)

- **現象:** 散布図の点が軸に張り付き比較にならない。
- **調査(実データで検証):** site-042の4対策案について、横軸「投資1億円あたりのNPV」を実際に計算すると:

  | 対策 | 投資額 | 絶対NPV/1億円 | 増分NPV/1億円 |
  |---|---|---|---|
  | 取水設備の効率化投資 | 8,300万円 | 15.1億円 | 6,533万円 |
  | 調達先の変更 | 1億5,200万円 | 8.2億円 | 3,240万円 |
  | 水リスク保険契約 | 500万円 | **243億円** | 3.1億円 |
  | 対策を実施せず監視を継続 | 50万円 | **2,400億円** | 0円 |

  横軸は従来「投資対効果(NPV)の絶対値」(`natureAdjustedNpv.central`、**通常NPV12億円という全候補共通の巨大な定数を含む**)を投資額で割っていた。投資額がわずかな候補(保険契約・監視継続)は分母が極小になり、比率が300倍以上に跳ね上がる。線形軸では残り2候補が原点付近に押しつぶされ、比較として機能しない。**これはダミーデータの問題ではなく指標の計算式の欠陥。**「対策を実施しない」案が実質無限大の値を取ること自体が指標として不合理(対策をしないなら投資対効果は定義上ゼロであるべき)。
- **修正:** `app/decision/page.tsx` の `invPerOku` を、絶対NPVではなく**通常NPVからの増分**(`natureAdjustedNpv.central − baselineNpv.value`)を投資額で割る式に変更。この式なら「対策を実施しない」案は自然に0(追加投資も追加効果もない)に収まり、他候補も1桁台の比率に収まる。散布図の軸ラベル・カードの `foot` 文言も「増分NPV」であることを明示するよう更新。D-14(散布図の軸パディング・ラベル配置)はそのまま活かす。
- **対象:** `app/decision/page.tsx`

### 指示 D-20 【P1】Reactの「Each child in a list should have a unique key prop」警告(Card全体に影響)

- **現象:** 再起動後、`/financial-bridge` 等でブラウザコンソールに「Check the render method of `Card`. It was passed a child from FinancialBridgePage.」という警告が出る。ページ自体は200で表示されるが(実害はない)、コンソールが汚れ、本来の異常検知の妨げになる。
- **根本原因:** `app/components/ui.tsx` はファイル全体に `"use client"` が付いていた(Card自体はhooksを使わない純粋な表示部品だが、同じファイルに `GuideBox`(useSyncExternalStore)・`ModalForm`(useState等)があったため、ファイル単位の"use client"に巻き込まれていた)。Server Component(各ページ)から `<Card><A/><B/></Card>` のように複数の子要素を直に渡すと、RSC(React Server Components)のシリアライズ時にchildrenが配列として境界を越え、クライアント側の再調整(hydration)で `.map()` 由来の配列と同じ「keyが要る」扱いになっていた。Card自体は本来Server Componentのままで問題ない部品だった。
- **修正:** hooksを使う部品(`GuideBox`・`GuideButton`・`ModalForm`・`PillButton`)を新設した `app/components/ui-client.tsx`(`"use client"`)へ移し、`app/components/ui.tsx` は純粋な表示部品(`Card`・`Tag`・`Term`・`KV`・`Stat`・`ScreenLead`)だけを残してServer Componentにした上で、`ui-client.tsx` からクライアント部品を再エクスポートする(`export { GuideBox, GuideButton, ModalForm, PillButton } from "./ui-client";`)。この形なら既存の11ファイルのimport文(`from "../components/ui"`)は一切変更不要。Cardが再びServer Componentになったことで、RSC境界を跨ぐ配列化そのものが起きなくなり、Card全体(全画面)でこの警告が解消する。
- **対象:** `app/components/ui.tsx`(書き換え)、`app/components/ui-client.tsx`(新設)

---

## §B 第4版(D-04〜D-14)の本体チェックアウトへの反映

前回セッションはworktree内で第4版の全16指示を実装・検証済みだったが、本体チェックアウト(ユーザーのdevサーバーが読む場所)への同期を行う前にセッションが終了していた。本版で全変更ファイルを本体へコピーし、`.next` の古いビルドキャッシュ(前日分、変更後のソースより古く、Turbopackの解決不整合でエラーを起こしていた)を削除した。`npm run typecheck` / `npm run lint` / `npm test`(441件)/ `npm run test:db`(39件)を本体チェックアウトで再実行し、全通過を確認済み。

---

## §C 追加の強化(D-07の補強)

### 指示 D-19 要因ラベルの短縮(ウォーターフォールの重なり対策の補強)

- 第4版D-07で「差が生じる理由」ウォーターフォールに2段ラベル振り分けを実装済みだったが、要因ラベル(`decompositionFactorLabel`、例:「地域差による調整の違い」)が長く、隣接ラベルと詰まる余地が残っていた。図の軸ラベル専用に短縮辞書(`DECOMPOSITION_FACTOR_SHORT_LABEL`、例:「地域差調整の違い」)を追加し、本文の読み下し文・凡例は通常表記のまま維持した。
- **対象:** `app/components/labels.ts`、`app/valuation/page.tsx`

---

## §D 確認して問題なしと判断した項目

- **D-02(まだ代表値を選んでいない課題の誤表示):** `lib/pipeline/open-tasks.test.ts` の既存テストで正しく動作していることを確認済み(選択済みの課題が誤って未選択欄に出ないこと)。§Bの同期により反映される。
- **D-03(生ID表示):** `methodLabel()` によるサブ係数解決を確認済み。ページのレンダリング結果(HTML)を検証し、可視テキストに生IDが残っていないことを確認した(URL・React内部キーへの残存は表示上問題ない)。
- **「試算の幅(手法別)」の0円表示:** ユーザーが「0も表示すべきであれば残しても良い」としたため、第4版D-08の方針(0円行は非表示にせず理由注記を付ける)を維持した。

---

## 実施状況

第5版はD-17〜D-20の4件すべて実装済み・検証済み(2026-08-17)。§Bの同期も完了。

**受け入れ基準:** (1) 承認閾値=通常NPV・対策案「対策を実施せず監視を継続」という組み合わせでも代表値変更・財務データ入力・ページ再読み込みが例外にならない(回帰テストで固定済み)。(2) 対策案比較の散布図で、投資額が小さい対策の横軸値が他候補と同じ桁数に収まる。(3) 第4版の受け入れ基準(1)〜(4)が本体チェックアウトで再現できる。

---

**参照:** 第4版指示書、ユーザーフィードバック(2026-08-17 再レビュー)、`packages/core/src/decision/dominant-assumption.ts:57`(NoContributingRecordError発生源・変更不可)、`packages/core/src/decision/nature-adjusted-npv.ts`(NPVレンジ退化の仕組み・変更不可)。
