import { clamp, cmToM } from '../../lib/units'
import { SurfaceMaterial } from '../../materials/SurfaceMaterial'
import { TexturedBox, BOX_SURFACES } from '../shared/TexturedBox'
import { shelfPositionsM } from '../shared/geometry'
import { num } from '../types'
import type { ObjectDef, ObjectRenderProps, SurfaceSpec } from '../types'

const GLASS_FALLBACK: SurfaceSpec = { finish: 'clearGlass', color: '#ffffff' }
const SHELF_FALLBACK: SurfaceSpec = { finish: 'matte', color: '#e8e8e8' }

/**
 * 層板只能放在玻璃罩「淨內部」：上緣要留出頂蓋厚度，
 * 上下緣還各要留半個層板厚度，否則層板會穿出頂蓋或陷進底櫃。
 * 回傳給 `shelfPositionsM` 用的淨高與底部位移（皆為公分）。
 */
export function glassShelfZone(
  glassHeightCm: number,
  glassThicknessCm: number,
  shelfThicknessCm: number,
): { innerHeightCm: number; baseOffsetCm: number } {
  const innerHeightCm = clamp(glassHeightCm - glassThicknessCm - shelfThicknessCm, 0, glassHeightCm)
  const baseOffsetCm = shelfThicknessCm / 2
  return { innerHeightCm, baseOffsetCm }
}

export type GlassPanelId = 'front' | 'back' | 'left' | 'right' | 'top'

export type GlassPanelSpec = {
  id: GlassPanelId
  /** 公分，物件本地座標，面板中心點。 */
  centerCm: [number, number, number]
  /** 公分，[寬, 高, 深]，對應 boxGeometry 的 args。 */
  sizeCm: [number, number, number]
  /** 這一面實際貼圖用的寬高（公分），給 SurfaceMaterial 算不變形的 UV。 */
  surfaceWidthCm: number
  surfaceHeightCm: number
}

/**
 * 玻璃罩五片薄板（前後左右牆 + 頂蓋）的幾何規格，皆為公分、物件本地座標。
 *
 * 兩個容易穿模的地方已經在這裡處理掉：
 * 1. 四面牆的高度是 `glassHeightCm - glassThicknessCm`（不是整個 `glassHeightCm`），
 *    牆頂剛好接到頂蓋底面，不會跟頂蓋重疊出一圈柱體。
 * 2. 左右牆的深度是內側淨深 `depthCm - 2 * glassThicknessCm`，
 *    只頂到前後牆的內側面，不會穿過去跟前後牆重疊出四條柱體。
 *
 * 整體外緣高度仍是 `glassHeightCm`：牆從 `baseHeightCm` 到
 * `baseHeightCm + glassHeightCm - glassThicknessCm`，頂蓋補滿剩下的
 * `glassThicknessCm` 到 `baseHeightCm + glassHeightCm`。
 */
export function glassCasePanels(
  widthCm: number,
  depthCm: number,
  baseHeightCm: number,
  glassHeightCm: number,
  glassThicknessCm: number,
): GlassPanelSpec[] {
  const wallHeightCm = glassHeightCm - glassThicknessCm
  const wallCenterYCm = baseHeightCm + wallHeightCm / 2
  const capCenterYCm = baseHeightCm + glassHeightCm - glassThicknessCm / 2
  const sideDepthCm = depthCm - glassThicknessCm * 2

  return [
    {
      id: 'front',
      centerCm: [0, wallCenterYCm, depthCm / 2 - glassThicknessCm / 2],
      sizeCm: [widthCm, wallHeightCm, glassThicknessCm],
      surfaceWidthCm: widthCm,
      surfaceHeightCm: wallHeightCm,
    },
    {
      id: 'back',
      centerCm: [0, wallCenterYCm, -depthCm / 2 + glassThicknessCm / 2],
      sizeCm: [widthCm, wallHeightCm, glassThicknessCm],
      surfaceWidthCm: widthCm,
      surfaceHeightCm: wallHeightCm,
    },
    {
      id: 'left',
      centerCm: [-widthCm / 2 + glassThicknessCm / 2, wallCenterYCm, 0],
      sizeCm: [glassThicknessCm, wallHeightCm, sideDepthCm],
      surfaceWidthCm: sideDepthCm,
      surfaceHeightCm: wallHeightCm,
    },
    {
      id: 'right',
      centerCm: [widthCm / 2 - glassThicknessCm / 2, wallCenterYCm, 0],
      sizeCm: [glassThicknessCm, wallHeightCm, sideDepthCm],
      surfaceWidthCm: sideDepthCm,
      surfaceHeightCm: wallHeightCm,
    },
    {
      id: 'top',
      centerCm: [0, capCenterYCm, 0],
      sizeCm: [widthCm, glassThicknessCm, depthCm],
      surfaceWidthCm: widthCm,
      surfaceHeightCm: depthCm,
    },
  ]
}

function Render({ params, surfaces }: ObjectRenderProps) {
  const w = num(params, 'widthCm')
  const d = num(params, 'depthCm')
  const baseH = num(params, 'baseHeightCm')
  const glassH = num(params, 'glassHeightCm')
  const glassT = num(params, 'glassThicknessCm')
  const shelfCount = num(params, 'shelfCount')
  const shelfT = num(params, 'shelfThicknessCm')

  const glassSpec = surfaces.glass ?? GLASS_FALLBACK
  const shelfSpec = surfaces.shelf ?? SHELF_FALLBACK

  const wM = cmToM(w)
  const dM = cmToM(d)
  const glassTM = cmToM(glassT)

  // 玻璃罩四面加頂蓋，各自獨立薄板，避免用實心箱體造成雙層折射；
  // 五片的精確幾何（避免彼此穿模）算在 glassCasePanels，這裡只轉單位。
  const panels = glassCasePanels(w, d, baseH, glassH, glassT)

  // 層板位置：淨高扣掉頂蓋厚度與層板自身厚度，底部再位移半個層板厚度，
  // 確保最上層不會穿出頂蓋、最下層不會陷進底櫃頂面。
  const { innerHeightCm, baseOffsetCm } = glassShelfZone(glassH, glassT, shelfT)
  const shelfYs = shelfPositionsM(innerHeightCm, shelfCount, baseH + baseOffsetCm)

  // 層板實際的水平面尺寸（內縮玻璃厚度後），貼圖尺寸要用這個，不是整個 w/d，
  // 否則貼圖長寬比會算錯。
  const shelfWidthCm = w - glassT * 2
  const shelfDepthCm = d - glassT * 2

  return (
    <group>
      <TexturedBox
        widthCm={w}
        heightCm={baseH}
        depthCm={d}
        surfaces={surfaces}
        position={[0, cmToM(baseH / 2), 0]}
      />

      {panels.map((p) => (
        <mesh
          key={p.id}
          position={[cmToM(p.centerCm[0]), cmToM(p.centerCm[1]), cmToM(p.centerCm[2])]}
          castShadow
        >
          <boxGeometry args={[cmToM(p.sizeCm[0]), cmToM(p.sizeCm[1]), cmToM(p.sizeCm[2])]} />
          <SurfaceMaterial spec={glassSpec} widthCm={p.surfaceWidthCm} heightCm={p.surfaceHeightCm} />
        </mesh>
      ))}

      {shelfYs.map((y, i) => (
        <mesh key={`shelf-${i}`} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[wM - glassTM * 2, cmToM(shelfT), dM - glassTM * 2]} />
          <SurfaceMaterial spec={shelfSpec} widthCm={shelfWidthCm} heightCm={shelfDepthCm} />
        </mesh>
      ))}
    </group>
  )
}

export const glassCaseDef: ObjectDef = {
  kind: 'glassCase',
  label: '玻璃罩高櫃',
  category: 'case',
  schema: [
    { key: 'widthCm', label: '寬', type: 'number', min: 20, max: 300, step: 1, unit: 'cm', default: 80 },
    { key: 'depthCm', label: '深', type: 'number', min: 20, max: 200, step: 1, unit: 'cm', default: 50 },
    { key: 'baseHeightCm', label: '底櫃高度', type: 'number', min: 10, max: 200, step: 1, unit: 'cm', default: 90 },
    { key: 'glassHeightCm', label: '玻璃罩高度', type: 'number', min: 10, max: 200, step: 1, unit: 'cm', default: 70 },
    { key: 'glassThicknessCm', label: '玻璃厚度', type: 'number', min: 0.3, max: 3, step: 0.1, unit: 'cm', default: 0.6 },
    { key: 'shelfCount', label: '層板數量', type: 'number', min: 0, max: 6, step: 1, unit: '', default: 1 },
    {
      key: 'shelfThicknessCm', label: '層板厚度', type: 'number', min: 0.5, max: 6, step: 0.5, unit: 'cm', default: 1.5,
      visibleWhen: (p) => num(p, 'shelfCount') > 0,
    },
  ],
  surfaces: [
    ...BOX_SURFACES,
    { id: 'glass', label: '玻璃罩', defaultFinish: 'clearGlass' },
    { id: 'shelf', label: '層板', defaultFinish: 'matte' },
  ],
  Render,
  defaultTransform: { position: [0, 0, 0], rotationY: 0 },
}
