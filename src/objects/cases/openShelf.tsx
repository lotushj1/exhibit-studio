import { clamp, cmToM, mToCm } from '../../lib/units'
import { SurfaceMaterial } from '../../materials/SurfaceMaterial'
import { shelfPositionsM } from '../shared/geometry'
import { bool, num } from '../types'
import type { ObjectDef, ObjectRenderProps, SurfaceSpec } from '../types'

const SIDE_FALLBACK: SurfaceSpec = { finish: 'matte', color: '#d8d8d8' }
const SHELF_FALLBACK: SurfaceSpec = { finish: 'matte', color: '#d8d8d8' }
const BACK_FALLBACK: SurfaceSpec = { finish: 'matte', color: '#e8e8e8' }

/**
 * 頂板／底板（統稱「蓋板」）的厚度與中間可用淨高。
 *
 * 蓋板厚度直接沿用 `shelfThicknessCm`，但夾在 `[0, heightCm / 2]`：
 * 兩片蓋板加起來絕對不會超過總高，`innerHeightCm` 也就永遠 >= 0。
 * 在 schema 允許的範圍內（heightCm 最小 60、shelfThicknessCm 最大 4）
 * 這個夾制完全不會觸發（2*4=8 遠小於 60），但函式本身要能承受任意輸入。
 */
export function openShelfCapZone(
  heightCm: number,
  shelfThicknessCm: number,
): { capThicknessCm: number; innerHeightCm: number } {
  const capThicknessCm = clamp(shelfThicknessCm, 0, heightCm / 2)
  const innerHeightCm = heightCm - capThicknessCm * 2
  return { capThicknessCm, innerHeightCm }
}

/**
 * 側板厚度夾在 `[0, widthCm / 2]`，確保左右側板加起來不會超過總寬，
 * 中間可用寬度 `widthCm - sideThicknessCm * 2` 永遠 >= 0。
 * 在 schema 允許的範圍內（widthCm 最小 30、sideThicknessCm 最大 4）
 * 這個夾制完全不會觸發，但函式本身要能承受任意輸入。
 */
export function openShelfSideThicknessCm(widthCm: number, sideThicknessCm: number): number {
  return clamp(sideThicknessCm, 0, widthCm / 2)
}

/**
 * 中間層板遇到背板時的深度與 Z 中心位移。
 *
 * 背板厚度沿用側板厚度，但夾在 `[0, depthCm]`，確保層板深度
 * `depthCm - backThicknessCm` 永遠 >= 0（跟 `openShelfCapZone`／
 * `openShelfSideThicknessCm` 的防禦寫法一致）。在 schema 允許的範圍內
 * （depthCm 最小 15、sideThicknessCm 最大 4）這個夾制不會觸發，
 * 但函式本身要能承受任意輸入。沒有背板時層板用滿整個深度、置中在 Z=0。
 */
export function openShelfBackZone(
  depthCm: number,
  backThicknessCm: number,
  hasBackPanel: boolean,
): { backThicknessCm: number; shelfDepthCm: number; shelfZCenterCm: number } {
  if (!hasBackPanel) return { backThicknessCm: 0, shelfDepthCm: depthCm, shelfZCenterCm: 0 }
  const backT = clamp(backThicknessCm, 0, depthCm)
  const shelfDepthCm = clamp(depthCm - backT, 0, depthCm)
  return { backThicknessCm: backT, shelfDepthCm, shelfZCenterCm: backT / 2 }
}

/**
 * 層板數量多、層板又厚時，等距分布的間距可能小於層板厚度本身，
 * 導致相鄰層板互相穿模。這裡把實際渲染的層板數量夾到「等距間距
 * 至少等於層板厚度」為止，不改動使用者輸入的厚度數值（厚度是
 * 介面上直接顯示的公分數，必須照實渲染，不能為了塞下更多層板而縮水）。
 *
 * 間距公式沿用 `shelfPositionsM`：gap = innerHeightCm / (count + 1)，
 * 要求 gap >= shelfThicknessCm，等價於 count <= innerHeightCm / shelfThicknessCm - 1。
 *
 * 這個函式保留作為純防禦性程式碼：schema 邊界（heightCm 最小 60、
 * shelfThicknessCm 最大 4）已經讓「請求數量塞不下」這個情況在合法
 * 參數範圍內完全不會發生（見 `openShelf.test.ts` 裡遍歷 schema 邊界的
 * 證明測試），但函式本身仍要能承受任意輸入，不因為呼叫端傳入不合法
 * 數值就整個穿模。
 */
export function openShelfFitShelfCount(
  innerHeightCm: number,
  shelfThicknessCm: number,
  requestedCount: number,
): number {
  const requested = Math.max(0, Math.round(requestedCount))
  if (shelfThicknessCm <= 0) return requested
  const maxCount = Math.floor(innerHeightCm / shelfThicknessCm) - 1
  return clamp(requested, 0, Math.max(0, maxCount))
}

export type OpenShelfSurfaceId = 'side' | 'shelf' | 'back'

export type OpenShelfPanelSpec = {
  id: string
  surfaceId: OpenShelfSurfaceId
  /** 公分，物件本地座標，面板中心點。 */
  centerCm: [number, number, number]
  /** 公分，[寬, 高, 深]，對應 boxGeometry 的 args。 */
  sizeCm: [number, number, number]
  /** 這一面實際貼圖用的寬高（公分）。 */
  surfaceWidthCm: number
  surfaceHeightCm: number
}

/**
 * 開放層架所有零件（左右側板、頂底蓋板、中間層板、可選背板）的幾何規格，
 * 皆為公分、物件本地座標。五種零件的體積彼此不重疊，構造方式：
 *
 * 1. 左右側板貫穿全高（0 到 heightCm），頂底蓋板的寬度內縮兩個側板厚度
 *    （`widthCm - sideThicknessCm * 2`），嵌在兩片側板之間，不會跟側板重疊。
 * 2. 中間層板寬度採同樣的內縮寬度，Y 座標用 `shelfPositionsM` 算在蓋板
 *    之間的淨高範圍內，並用 `openShelfFitShelfCount` 確保層板數量不會多到
 *    互相穿模。
 * 3. 背板（若啟用）嵌在最深處，寬同樣內縮、高只佔蓋板之間的淨高，
 *    因此背板的 Y／X 範圍跟蓋板、側板都只是「面貼齊」不重疊；
 *    中間層板的深度也內縮一個背板厚度，讓層板止於背板前緣，不會插進背板裡。
 */
export function openShelfPanels(
  widthCm: number,
  depthCm: number,
  heightCm: number,
  shelfCount: number,
  shelfThicknessCm: number,
  sideThicknessCm: number,
  hasBackPanel: boolean,
): OpenShelfPanelSpec[] {
  const sideT = openShelfSideThicknessCm(widthCm, sideThicknessCm)
  const { capThicknessCm: capT, innerHeightCm } = openShelfCapZone(heightCm, shelfThicknessCm)
  const innerWidthCm = widthCm - sideT * 2
  const fitCount = openShelfFitShelfCount(innerHeightCm, shelfThicknessCm, shelfCount)
  const shelfYsCm = shelfPositionsM(innerHeightCm, fitCount, capT).map(mToCm)

  // 背板佔掉最深處的厚度；中間層板深度內縮同樣的量，止於背板前緣，
  // 不會穿進背板裡。沒有背板時層板用滿整個深度。
  const { backThicknessCm: backT, shelfDepthCm, shelfZCenterCm } = openShelfBackZone(
    depthCm,
    sideT,
    hasBackPanel,
  )

  const panels: OpenShelfPanelSpec[] = []

  for (const sign of [-1, 1] as const) {
    panels.push({
      id: sign === -1 ? 'sideLeft' : 'sideRight',
      surfaceId: 'side',
      centerCm: [sign * (widthCm / 2 - sideT / 2), heightCm / 2, 0],
      sizeCm: [sideT, heightCm, depthCm],
      surfaceWidthCm: depthCm,
      surfaceHeightCm: heightCm,
    })
  }

  panels.push({
    id: 'capBottom',
    surfaceId: 'shelf',
    centerCm: [0, capT / 2, 0],
    sizeCm: [innerWidthCm, capT, depthCm],
    surfaceWidthCm: innerWidthCm,
    surfaceHeightCm: depthCm,
  })

  panels.push({
    id: 'capTop',
    surfaceId: 'shelf',
    centerCm: [0, heightCm - capT / 2, 0],
    sizeCm: [innerWidthCm, capT, depthCm],
    surfaceWidthCm: innerWidthCm,
    surfaceHeightCm: depthCm,
  })

  shelfYsCm.forEach((yCm, i) => {
    panels.push({
      id: `shelf-${i}`,
      surfaceId: 'shelf',
      centerCm: [0, yCm, shelfZCenterCm],
      sizeCm: [innerWidthCm, shelfThicknessCm, shelfDepthCm],
      surfaceWidthCm: innerWidthCm,
      surfaceHeightCm: shelfDepthCm,
    })
  })

  if (hasBackPanel) {
    panels.push({
      id: 'back',
      surfaceId: 'back',
      centerCm: [0, heightCm / 2, -depthCm / 2 + backT / 2],
      sizeCm: [innerWidthCm, innerHeightCm, backT],
      surfaceWidthCm: innerWidthCm,
      surfaceHeightCm: innerHeightCm,
    })
  }

  return panels
}

function Render({ params, surfaces }: ObjectRenderProps) {
  const w = num(params, 'widthCm')
  const d = num(params, 'depthCm')
  const h = num(params, 'heightCm')
  const shelfCount = num(params, 'shelfCount')
  const shelfT = num(params, 'shelfThicknessCm')
  const sideT = num(params, 'sideThicknessCm')
  const hasBack = bool(params, 'hasBackPanel')

  const side = surfaces.side ?? SIDE_FALLBACK
  const shelf = surfaces.shelf ?? SHELF_FALLBACK
  const back = surfaces.back ?? BACK_FALLBACK
  const specById: Record<OpenShelfSurfaceId, SurfaceSpec> = { side, shelf, back }

  const panels = openShelfPanels(w, d, h, shelfCount, shelfT, sideT, hasBack)

  return (
    <group>
      {panels.map((p) => (
        <mesh
          key={p.id}
          position={[cmToM(p.centerCm[0]), cmToM(p.centerCm[1]), cmToM(p.centerCm[2])]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[cmToM(p.sizeCm[0]), cmToM(p.sizeCm[1]), cmToM(p.sizeCm[2])]} />
          <SurfaceMaterial
            spec={specById[p.surfaceId]}
            widthCm={p.surfaceWidthCm}
            heightCm={p.surfaceHeightCm}
          />
        </mesh>
      ))}
    </group>
  )
}

export const openShelfDef: ObjectDef = {
  kind: 'openShelf',
  label: '開放層架',
  category: 'case',
  schema: [
    { key: 'widthCm', label: '寬', type: 'number', min: 30, max: 400, step: 1, unit: 'cm', default: 100 },
    { key: 'depthCm', label: '深', type: 'number', min: 15, max: 120, step: 1, unit: 'cm', default: 35 },
    { key: 'heightCm', label: '總高', type: 'number', min: 60, max: 300, step: 1, unit: 'cm', default: 180 },
    { key: 'shelfCount', label: '層板數量', type: 'number', min: 0, max: 10, step: 1, unit: '', default: 4 },
    { key: 'shelfThicknessCm', label: '層板厚度', type: 'number', min: 1, max: 4, step: 0.5, unit: 'cm', default: 2.5 },
    { key: 'sideThicknessCm', label: '側板厚度', type: 'number', min: 1, max: 4, step: 0.5, unit: 'cm', default: 2.5 },
    { key: 'hasBackPanel', label: '加背板', type: 'boolean', default: true },
  ],
  surfaces: [
    { id: 'side', label: '側板', defaultFinish: 'matte' },
    { id: 'shelf', label: '層板', defaultFinish: 'matte' },
    { id: 'back', label: '背板', defaultFinish: 'matte' },
  ],
  Render,
  defaultTransform: { position: [0, 0, 0], rotationY: 0 },
}
