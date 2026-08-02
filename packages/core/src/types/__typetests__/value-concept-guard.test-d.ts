/**
 * 型レベルのテスト。構想書8.2/design-rationale-log D-11の規律
 * (価値概念の混在を型で禁止する)が実際にコンパイルエラーを起こすことを確認する。
 * このファイルは実行されない(*.test-d.ts、tscの型チェックのみが目的)。
 *
 * build-plan §4.2の完了条件「価値概念の合算がコンパイルエラーになること」の検証。
 */

import { exchangeAmount, welfareAmount, sumExchangeAmounts, sumWelfareAmounts } from "../common";
import type { ExchangeValuationRecord, WelfareValuationRecord } from "../valuation";
import { buildDecisionRecordValuationRefs } from "../decision";

// OK: 交換価値同士の合算
const okExchange = sumExchangeAmounts([exchangeAmount(100), exchangeAmount(200)]);
void okExchange;

// OK: 厚生価値同士の合算
const okWelfare = sumWelfareAmounts([welfareAmount(100), welfareAmount(200)]);
void okWelfare;

// NG: 交換価値と厚生価値を混ぜて合算しようとすると、branded typeの不一致でコンパイルエラーになる
// @ts-expect-error 交換価値と厚生価値は混在できない(構想書8.2)
sumExchangeAmounts([exchangeAmount(100), welfareAmount(200)]);

// NG: 厚生価値の配列を交換価値専用の関数に渡すこともコンパイルエラーになる
// @ts-expect-error 厚生価値を交換価値の合算関数に渡すことはできない
sumExchangeAmounts([welfareAmount(100)]);

// NG: DecisionRecord(M6)の構築経路にWelfareValuationRecordを渡すとコンパイルエラーになる
declare const welfareRecords: WelfareValuationRecord[];
// @ts-expect-error 厚生価値のValuationRecordをDecisionRecordの入力にはできない(除外事項X7、M6 D-1)
buildDecisionRecordValuationRefs(welfareRecords);

// OK: ExchangeValuationRecordなら問題なく構築できる
declare const exchangeRecords: ExchangeValuationRecord[];
const ids = buildDecisionRecordValuationRefs(exchangeRecords);
void ids;
