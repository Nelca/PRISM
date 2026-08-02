/**
 * M8 D-3・D-5:係数セット・パラメータの版管理レジストリ。
 * 参照元: docs/requirements/m8-ledger-versioning.md §3・§5
 *
 * 旧版は削除せず保持し続ける。訂正は新しいエントリの追記のみで行い、既存エントリを
 * 編集・削除する経路は用意しない(immutable、M4の代表値並記・M6のbindingMechanismHistoryと
 * 同じ「追記型の訂正」パターン)。
 *
 * パラメータ値そのもの(PPP出典・η値等)はここでは保持しない。既にM3の
 * GeographicCalibrationRecordが各ValuationRecordに自己完結して保存されているため、
 * 「旧版係数での再計算」はその値をそのまま計算関数に渡せば実現できる(plan file 論点2)。
 * このレジストリは「いつ・どの版が有効で、いつ・なぜ次の版に置き換わったか」を追跡する台帳。
 */

import type { VersionedParameterSet } from "../types/ledger";

export class MissingActiveVersionError extends Error {}
export class ChangeReasonRequiredError extends Error {}

export function registerInitialVersion(setId: string, version: string, effectiveFrom: string): VersionedParameterSet {
  return { setId, version, effectiveFrom };
}

/**
 * 現在有効な版(supersededByが未設定のもの)にsupersededByを設定し、新しい版を追記した
 * 新しい配列を返す。元の配列は変更しない(D-5、immutable)。
 */
export function supersedeVersion(
  registry: VersionedParameterSet[],
  setId: string,
  newVersion: string,
  effectiveFrom: string,
  changeReason: string
): VersionedParameterSet[] {
  if (!changeReason.trim()) {
    throw new ChangeReasonRequiredError("M8 D-3: 版を更新する場合、変更理由(changeReason)の入力は必須です。");
  }

  const activeIndex = registry.findIndex((v) => v.setId === setId && v.supersededBy === undefined);
  if (activeIndex === -1) {
    throw new MissingActiveVersionError(`M8 D-3: setId "${setId}" の現在有効な版が見つかりません。`);
  }

  const updated = [...registry];
  updated[activeIndex] = { ...updated[activeIndex], supersededBy: newVersion };
  updated.push({ setId, version: newVersion, effectiveFrom, changeReason });

  return updated;
}

export function getActiveVersion(registry: VersionedParameterSet[], setId: string): VersionedParameterSet | undefined {
  return registry.find((v) => v.setId === setId && v.supersededBy === undefined);
}

/** 削除されないことを前提に、setIdに紐づく全版(旧版含む)を返す。 */
export function listVersionHistory(registry: VersionedParameterSet[], setId: string): VersionedParameterSet[] {
  return registry.filter((v) => v.setId === setId);
}
