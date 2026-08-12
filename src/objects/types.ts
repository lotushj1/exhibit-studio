import type React from 'react'
import type { FinishId } from '../materials/finishes'
import type { FitMode, Rotation } from '../materials/textureFit'

export type ObjectKind =
  | 'boxPlinth' | 'glassCase' | 'openShelf' | 'backWall'
  | 'humanFigure'
  | 'chair' | 'stool' | 'crate' | 'sideCabinet' | 'tableSign'

export type ParamValue = number | string | boolean

export type SurfaceSpec = {
  finish: FinishId
  /** hex 顏色，與 finish 正交。 */
  color: string
  texture?: {
    assetId: string
    fit: FitMode
    offset: [number, number]
    scale: number
    rotation: Rotation
    /**
     * 原色顯示：貼圖不受光照、不被 `color` 染色、也不過 tone mapping，
     * 螢幕上看到的就是圖檔本身的顏色。用來確認主視覺的實際色彩，
     * 而不是被展櫃底色與燈光壓過一層的樣子。
     * 舊存檔沒有這個欄位，一律當 false（維持原本的受光行為）。
     */
    unlit: boolean
  }
}

export type SceneObject = {
  id: string
  kind: ObjectKind
  name: string
  params: Record<string, ParamValue>
  transform: {
    /** 公尺。 */
    position: [number, number, number]
    /** 弧度，只有 Y 軸。 */
    rotationY: number
  }
  surfaces: Record<string, SurfaceSpec>
  visible: boolean
  locked: boolean
}

export type ParamDef = {
  key: string
  label: string
  type: 'number' | 'select' | 'boolean'
  /** number 專用。單位一律公分或度，介面直接顯示這個數值。 */
  min?: number
  max?: number
  step?: number
  unit?: 'cm' | 'deg' | ''
  /** select 專用。 */
  options?: { value: string; label: string }[]
  default: ParamValue
  /** 回傳 false 時屬性面板隱藏此欄位。 */
  visibleWhen?: (params: Record<string, ParamValue>) => boolean
  /**
   * 這個參數改變時，連帶要調整的其他參數。
   * 例如假人切換體型時，身高跟著換成該體型的預設值。
   *
   * 只套用**一層**，不會連鎖：`sceneStore` 把這裡回傳的每個值直接夾進
   * 對應參數的 min/max 後寫回 `params`，不會再去檢查那些參數自己的
   * `sideEffect`（如果它們也定義了的話）。如果之後有參數的 `sideEffect`
   * 需要連鎖觸發別的參數的 `sideEffect`，這裡的行為需要另外擴充，不要
   * 假設它會自動遞迴。
   */
  sideEffect?: (
    value: ParamValue,
    params: Record<string, ParamValue>,
  ) => Record<string, ParamValue>
}

export type SurfaceDef = {
  id: string
  label: string
  defaultFinish: FinishId
}

export type ObjectRenderProps = {
  params: Record<string, ParamValue>
  surfaces: Record<string, SurfaceSpec>
}

export type ObjectDef = {
  kind: ObjectKind
  label: string
  category: 'case' | 'figure' | 'prop'
  schema: ParamDef[]
  surfaces: SurfaceDef[]
  Render: React.FC<ObjectRenderProps>
  defaultTransform: SceneObject['transform']
}

/** 讀取數值參數，型別不符時回退到 0。 */
export function num(params: Record<string, ParamValue>, key: string): number {
  const v = params[key]
  return typeof v === 'number' ? v : 0
}

/** 讀取布林參數。 */
export function bool(params: Record<string, ParamValue>, key: string): boolean {
  return params[key] === true
}

/** 讀取字串參數。 */
export function str(params: Record<string, ParamValue>, key: string): string {
  const v = params[key]
  return typeof v === 'string' ? v : ''
}
