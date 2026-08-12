import { clamp } from '../lib/units'
import type { ParamDef, ParamValue } from './types'

/**
 * 把任意值對到某個參數定義該有的樣子：型別不符或數字不是有限值時回傳
 * `undefined`（呼叫端應該退回目前值或 schema 預設值）；數字會夾在
 * `min`/`max` 之間。
 *
 * 兩個入口共用這份邏輯（Finding 3）：
 * - `sceneStore.applyParam`：介面操作的值來自 TS 型別保證的呼叫端（Slider、
 *   TextField……），型別永遠對，這裡主要是借用數字夾制的部分。
 * - `persistence.reconcile`：專案檔／存檔是使用者之間互傳的**不可信輸入**，
 *   型別與範圍都可能是壞的（例如手改 JSON 把 `heightCm` 塞成 30，繞過
 *   `openShelf` schema 的 `min: 60`；或塞一個 `NaN`——`typeof NaN === 'number'`
 *   會被舊版只檢查 typeof 的邏輯放行）。
 *
 * 只抽出這一份，兩邊就不會各自演化出不一致的驗證規則。
 *
 * `select` 型參數（`paramDef.options` 存在時）除了型別，還會比對值是不是
 * `options` 其中一個的 `value`（Residual 2）：光比對 `typeof` 會讓專案檔把
 * 假人 `build` 改成 `"nope"` 這種字串直接通過驗證，一路傳到
 * `BUILD_PRESETS['nope']` 拿到 `undefined`，讀 `cfg.headRatio` 時整個場景
 * 掉進 `ErrorBoundary`。不在 `options` 裡的值一律回傳 `undefined`，讓呼叫端
 * （`reconcile`）退回 schema 預設值。
 */
export function coerceParam(paramDef: ParamDef, value: unknown): ParamValue | undefined {
  if (paramDef.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
    return clamp(value, paramDef.min ?? -Infinity, paramDef.max ?? Infinity)
  }
  if (typeof value !== typeof paramDef.default) return undefined
  if (paramDef.options && !paramDef.options.some((o) => o.value === value)) return undefined
  return value as ParamValue
}
