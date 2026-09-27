/** 画面・出力の日時は日本時間で表示する(利用者の操作時刻と照合できるように)。 */
const JST = "Asia/Tokyo";

const DATE_TIME = new Intl.DateTimeFormat("ja-JP", { timeZone: JST, dateStyle: "short", timeStyle: "short" });
const ISO_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: JST, year: "numeric", month: "2-digit", day: "2-digit" });

/** 例: 2026/09/26 22:30 */
export function formatJstDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

/** 日本時間の今日を YYYY-MM-DD で返す(期限との比較用)。 */
export function todayInJst(now: Date = new Date()): string {
  return ISO_DATE.format(now);
}
