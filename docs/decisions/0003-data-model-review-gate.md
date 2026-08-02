# ADR-0003: データモデルレビュー([GATE]、build-plan §4.3)

**日付:** 2026-08-02
**種別:** [GATE]判定(build-plan §4.3)
**関連:** `docs/roadmap/build-plan.md` §4.3、`packages/core/src/types/`、design-rationale-log.md §2.14(D-73〜D-75)

---

## 論点

build-plan §4.3は、[P1]データモデル確定の最後にレビューを行い、「M1〜M8の各要件を型定義に照らし、後から足す必要が出そうな項目がないか点検する」ことを求めている。**このレビューを通過したら型定義の破壊的変更は原則しない。**

## 実施内容

`packages/core/src/types/`の実装済み型定義(common・site・assessment・valuation・divergence・financial-bridge・decision・disclosure・ledger)を、M1〜M8の要件定義書8本、および構想書(concept-v2.md §8.1・8.4・8.7〜8.9・9.1)、build-plan §4.1の「薄くできないもの」一覧と、1件ずつ突き合わせた。

## 判定:条件付き通過

**6件の齟齬が見つかり、すべて修正した(design-rationale-log D-73〜D-75)。** 重大度別の内訳:

| 重大度 | 件数 | 内容 |
|---|---|---|
| 高 | 1件 | 地理較正の記録に「相対価格上昇係数^経過年数」が欠落(構想書8.4の較正式5項のうち1項が抜けていた) |
| 中 | 1件 | `DisclosureView`型(構想書8.1・9.1の出力第3層)が要件定義段階から完全に欠落 |
| 低〜中 | 4件 | `GapFinding.id`欠落、`ComparisonTargets.nonGaapLabel`欠落、`valueConceptGuard`タグの意図的省略(未文書化だった)、`PairwiseDecomposition`の価値概念未ガード、`EndpointCoverage`関連フィールドの一部欠落、`assumptionEntryIds`の一貫性欠如 |

**最も重要な発見(D-73・D-74)は、いずれも「要件定義書の執筆段階で既に構想書からドリフトしていた」パターンである。** M3要件定義書§3.3の数値例は最初から4項目しか使っておらず、M7要件定義書は`DisclosureView`に一度も触れていなかった。つまりこれは実装のミスというより、**要件定義から実装への変換時の検証だけでは検出できない種類の齟齬**であり、構想書という一次資料に立ち返って型実装と直接突き合わせて初めて発見できた。

## 対応

- `GeographicCalibrationRecord`に`relativePriceEscalationRate`・`elapsedYears`を追加。M3要件定義書§3.3の数値例を5項目に訂正
- `disclosure.ts`に`DisclosureView`・`DisclosureStandard`の型の骨格を追加(生成ロジックはフェーズ2以降、build-plan §4.1と同じ「構造は完全に、機能は後で」の原則)
- その他4件はdesign-rationale-log D-75の表の通り修正済み
- `npx tsc --noEmit`・`npx eslint`とも再実行し、エラーがないことを確認済み

## 総合判定

**通過。** 発見された齟齬はすべてこのレビューの場で修正済みであり、修正後の型定義に対して再度この網羅性を主張する。**本レビュー通過後、型定義の破壊的変更は原則行わない**(build-plan §4.3)。ただし以下は例外として明記しておく。

- フェーズ0で未確認の外部データ(ESVD日本カバレッジ、CICES階層、CE Delft/IFVIのライセンス確定)が判明した際に、型の`Optional`フィールドが埋まる、または`unmapped`/`pending`状態が解消される、といった**後方互換的な変更**は引き続き想定内
- `DisclosureView`の生成ロジック実装時に、現在の骨格型で不足が判明した場合の拡張(現状フィールドを壊さない前提での追加)は許容する

## 次のアクション

[P2]モジュール実装(ロジック本体)に進む。build-plan §2の実装順序(M1→M3→M4→M6→M2→M5→M7→M8)に従う。
