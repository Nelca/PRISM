export interface NumberConstraints {
  label: string;
  min?: number;
  max?: number;
  integer?: boolean;
}

export type NumberParseResult = { value: number } | { error: string };

/** FormData由来の値を、有限性と業務上の基本範囲まで含めて検証する。 */
export function parseRequiredNumber(value: FormDataEntryValue | null, rules: NumberConstraints): NumberParseResult {
  const raw = value === null ? "" : String(value).trim();
  if (raw === "") return { error: `${rules.label}を入力してください。` };

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return { error: `${rules.label}は有限の数値で入力してください。` };
  if (rules.integer && !Number.isInteger(parsed)) return { error: `${rules.label}は整数で入力してください。` };
  if (rules.min !== undefined && parsed < rules.min) return { error: `${rules.label}は${rules.min}以上で入力してください。` };
  if (rules.max !== undefined && parsed > rules.max) return { error: `${rules.label}は${rules.max}以下で入力してください。` };
  return { value: parsed };
}

export function parseOptionalNumber(
  value: FormDataEntryValue | null,
  rules: NumberConstraints
): NumberParseResult | { value: null } {
  if (value === null || String(value).trim() === "") return { value: null };
  return parseRequiredNumber(value, rules);
}
