import { clamp, cmToM } from '../../lib/units'
import { SurfaceMaterial } from '../../materials/SurfaceMaterial'
import { num } from '../types'
import type { ObjectDef, ObjectRenderProps, SurfaceSpec } from '../types'

const FALLBACK: SurfaceSpec = { finish: 'matte', color: '#d0d3d6' }

/** 座面厚度固定 4 公分，跟椅子的座面厚度一致，是設計選擇不開放調整。 */
export const STOOL_SEAT_THICKNESS_CM = 4

/**
 * 腳的實際高度：總高扣掉固定的座面厚度，讓腳的頂面剛好接到座面底面。
 * 跟 `chair.ts` 的 `chairLegHeightCm` 同一種寫法：schema 範圍內
 * （總高最小 25 公分）永遠是正值，這裡仍用 `Math.max` 防禦任意輸入。
 */
export function stoolLegHeightCm(heightCm: number): number {
  return Math.max(0.01, heightCm - STOOL_SEAT_THICKNESS_CM)
}

/**
 * 三隻腳圍成的圓周半徑。預設偏好值是座面半徑的 0.7 倍，但座面很小、
 * 腳很粗時夾住，讓腳的外緣（`orbitRadius + legRadius`）不超出座面
 * 邊緣，避免腳從座面下方戳出來的視覺穿模（review 在 review 前抓到：
 * 直徑最小、腳最粗的極端組合下，0.7 倍座面半徑會讓腳的外緣超出座面
 * 邊緣約 1 公分）。
 *
 * 這個夾制不會反過來讓三隻腳互相穿模：在 schema 範圍內
 * （直徑最小 20、腳粗最大 8），夾住後的最小可用半徑仍有安全餘裕，
 * 見 `stool.test.ts` 遍歷 schema 邊界的證明測試。
 */
export function stoolLegOrbitRadiusCm(diameterCm: number, legThicknessCm: number): number {
  const seatRadiusCm = diameterCm / 2
  const legRadiusCm = legThicknessCm / 2
  const preferredCm = seatRadiusCm * 0.7
  return clamp(preferredCm, 0, Math.max(0, seatRadiusCm - legRadiusCm))
}

export type StoolSurfaceId = 'seat' | 'frame'

export type StoolPart = {
  id: string
  surfaceId: StoolSurfaceId
  /** 公分，物件本地座標，零件中心點。 */
  centerCm: [number, number, number]
  /** 公分，圓柱半徑（不是直徑）。 */
  radiusCm: number
  /** 公分，圓柱高度（沿 Y 軸）。 */
  heightCm: number
  /** 這一零件實際貼圖用的寬高（公分），圓柱用直徑，不是半徑。 */
  surfaceWidthCm: number
  surfaceHeightCm: number
}

/**
 * 三隻腳與座面的幾何規格，皆為公分、物件本地座標。腳的頂面
 * （Y = legHeightCm）剛好接到座面底面，兩者只共用一個面，體積不重疊；
 * 三隻腳彼此的水平距離見 `stoolLegOrbitRadiusCm` 的說明與其測試。
 */
export function stoolParts(diameterCm: number, heightCm: number, legThicknessCm: number): StoolPart[] {
  const legHeightCm = stoolLegHeightCm(heightCm)
  const legRadiusCm = legThicknessCm / 2
  const orbitRadiusCm = stoolLegOrbitRadiusCm(diameterCm, legThicknessCm)
  const seatRadiusCm = diameterCm / 2

  const parts: StoolPart[] = [0, 1, 2].map((i) => {
    const angle = (i / 3) * Math.PI * 2
    return {
      id: `leg-${i}`,
      surfaceId: 'frame',
      centerCm: [Math.cos(angle) * orbitRadiusCm, legHeightCm / 2, Math.sin(angle) * orbitRadiusCm],
      radiusCm: legRadiusCm,
      heightCm: legHeightCm,
      surfaceWidthCm: legThicknessCm,
      surfaceHeightCm: legHeightCm,
    }
  })

  parts.push({
    id: 'seat',
    surfaceId: 'seat',
    centerCm: [0, legHeightCm + STOOL_SEAT_THICKNESS_CM / 2, 0],
    radiusCm: seatRadiusCm,
    heightCm: STOOL_SEAT_THICKNESS_CM,
    // 座面是圓形薄板，貼圖用外接正方形（直徑 x 直徑），跟人偶的圓柱
    // 部位（頸、軀幹）同一種「直徑不是半徑」的慣例。
    surfaceWidthCm: diameterCm,
    surfaceHeightCm: diameterCm,
  })

  return parts
}

function Render({ params, surfaces }: ObjectRenderProps) {
  const dia = num(params, 'diameterCm')
  const h = num(params, 'heightCm')
  const legT = num(params, 'legThicknessCm')

  const seat = surfaces.seat ?? FALLBACK
  const frame = surfaces.frame ?? FALLBACK
  const specBySurface: Record<StoolSurfaceId, SurfaceSpec> = { seat, frame }

  const parts = stoolParts(dia, h, legT)

  return (
    <group>
      {parts.map((p) => (
        <mesh
          key={p.id}
          position={[cmToM(p.centerCm[0]), cmToM(p.centerCm[1]), cmToM(p.centerCm[2])]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[cmToM(p.radiusCm), cmToM(p.radiusCm), cmToM(p.heightCm), p.id === 'seat' ? 24 : 8]} />
          <SurfaceMaterial
            spec={specBySurface[p.surfaceId]}
            widthCm={p.surfaceWidthCm}
            heightCm={p.surfaceHeightCm}
          />
        </mesh>
      ))}
    </group>
  )
}

export const stoolDef: ObjectDef = {
  kind: 'stool',
  label: '板凳',
  category: 'prop',
  schema: [
    { key: 'diameterCm', label: '座面直徑', type: 'number', min: 20, max: 60, step: 1, unit: 'cm', default: 34 },
    { key: 'heightCm', label: '高', type: 'number', min: 25, max: 90, step: 1, unit: 'cm', default: 45 },
    { key: 'legThicknessCm', label: '腳粗細', type: 'number', min: 2, max: 8, step: 0.5, unit: 'cm', default: 3 },
  ],
  surfaces: [
    { id: 'seat', label: '座面', defaultFinish: 'wood' },
    { id: 'frame', label: '腳', defaultFinish: 'brushedMetal' },
  ],
  Render,
  defaultTransform: { position: [-1.2, 0, 0.8], rotationY: 0 },
}
