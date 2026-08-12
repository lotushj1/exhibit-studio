import { cmToM } from '../../lib/units'
import { SurfaceMaterial } from '../../materials/SurfaceMaterial'
import { num } from '../types'
import type { ObjectDef, ObjectRenderProps, SurfaceSpec } from '../types'

const FALLBACK: SurfaceSpec = { finish: 'matte', color: '#d0d3d6' }

/** 座面厚度固定 4 公分，跟其餘尺寸的比例是設計選擇，不開放使用者調整。 */
export const CHAIR_SEAT_THICKNESS_CM = 4

/**
 * 椅腳的實際高度：座面高扣掉固定的座面厚度，讓腳的頂面剛好接到座面
 * 底面，兩者精確相接、不重疊也不留縫。在 schema 範圍內（座面高最小
 * 25 公分，遠大於 4 公分的座面厚度）永遠是正值，這裡仍用 `Math.max`
 * 防禦任意輸入，跟 `humanFigure.ts` 的 `capsuleLengthCm` 同一種寫法。
 */
export function chairLegHeightCm(seatHeightCm: number): number {
  return Math.max(0.01, seatHeightCm - CHAIR_SEAT_THICKNESS_CM)
}

export type ChairSurfaceId = 'seat' | 'frame'

export type ChairPart = {
  id: string
  surfaceId: ChairSurfaceId
  /** 公分，物件本地座標，零件中心點。 */
  centerCm: [number, number, number]
  /** 公分，[寬, 高, 深]，對應 boxGeometry 的 args。 */
  sizeCm: [number, number, number]
  /** 這一零件實際貼圖用的寬高（公分）。 */
  surfaceWidthCm: number
  surfaceHeightCm: number
}

/**
 * 椅子四腳、座面、椅背（可選）的幾何規格，皆為公分、物件本地座標。
 *
 * 不穿模的關鍵：
 * 1. 四腳的高度是 `chairLegHeightCm`（座面高減座面厚度），腳的頂面
 *    （Y = legHeightCm）剛好接到座面底面，兩者只共用一個面，體積不重疊。
 * 2. 椅背底面（Y = legHeightCm + 座面厚度）剛好接到座面頂面，同樣只
 *    共用一個面。椅背與後兩腳雖然 Z 範圍相同（都貼齊椅子背側），但
 *    Y 範圍完全不相交：後腳只到座面底面，椅背從座面頂面才開始，
 *    中間隔著整個座面厚度，所以不會重疊。
 */
export function chairParts(
  widthCm: number,
  depthCm: number,
  seatHeightCm: number,
  backHeightCm: number,
  legThicknessCm: number,
): ChairPart[] {
  const legHeightCm = chairLegHeightCm(seatHeightCm)
  const legHalf = legThicknessCm / 2
  const seatTopCm = legHeightCm + CHAIR_SEAT_THICKNESS_CM

  const legSpecs: Array<{ id: string; xCm: number; zCm: number }> = [
    { id: 'legBackLeft', xCm: -widthCm / 2 + legHalf, zCm: -depthCm / 2 + legHalf },
    { id: 'legBackRight', xCm: widthCm / 2 - legHalf, zCm: -depthCm / 2 + legHalf },
    { id: 'legFrontLeft', xCm: -widthCm / 2 + legHalf, zCm: depthCm / 2 - legHalf },
    { id: 'legFrontRight', xCm: widthCm / 2 - legHalf, zCm: depthCm / 2 - legHalf },
  ]

  const parts: ChairPart[] = legSpecs.map(({ id, xCm, zCm }) => ({
    id,
    surfaceId: 'frame',
    centerCm: [xCm, legHeightCm / 2, zCm],
    sizeCm: [legThicknessCm, legHeightCm, legThicknessCm],
    surfaceWidthCm: legThicknessCm,
    surfaceHeightCm: legHeightCm,
  }))

  parts.push({
    id: 'seat',
    surfaceId: 'seat',
    centerCm: [0, legHeightCm + CHAIR_SEAT_THICKNESS_CM / 2, 0],
    sizeCm: [widthCm, CHAIR_SEAT_THICKNESS_CM, depthCm],
    // 座面是薄板，貼圖用頂/底這兩個主要可見面的尺寸（寬 x 深），
    // 忽略四個窄邊，跟 openShelf 的層板、glassCase 的層板同一種簡化。
    surfaceWidthCm: widthCm,
    surfaceHeightCm: depthCm,
  })

  if (backHeightCm > 0) {
    parts.push({
      id: 'back',
      surfaceId: 'seat',
      centerCm: [0, seatTopCm + backHeightCm / 2, -depthCm / 2 + legHalf],
      sizeCm: [widthCm, backHeightCm, legThicknessCm],
      // 椅背也是薄板，貼圖用正/背這兩個主要可見面的尺寸（寬 x 高）。
      surfaceWidthCm: widthCm,
      surfaceHeightCm: backHeightCm,
    })
  }

  return parts
}

function Render({ params, surfaces }: ObjectRenderProps) {
  const w = num(params, 'widthCm')
  const d = num(params, 'depthCm')
  const seatH = num(params, 'seatHeightCm')
  const backH = num(params, 'backHeightCm')
  const legT = num(params, 'legThicknessCm')

  const seat = surfaces.seat ?? FALLBACK
  const frame = surfaces.frame ?? FALLBACK
  const specBySurface: Record<ChairSurfaceId, SurfaceSpec> = { seat, frame }

  const parts = chairParts(w, d, seatH, backH, legT)

  return (
    <group>
      {parts.map((p) => (
        <mesh
          key={p.id}
          position={[cmToM(p.centerCm[0]), cmToM(p.centerCm[1]), cmToM(p.centerCm[2])]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[cmToM(p.sizeCm[0]), cmToM(p.sizeCm[1]), cmToM(p.sizeCm[2])]} />
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

export const chairDef: ObjectDef = {
  kind: 'chair',
  label: '椅子',
  category: 'prop',
  schema: [
    { key: 'widthCm', label: '寬', type: 'number', min: 25, max: 90, step: 1, unit: 'cm', default: 45 },
    { key: 'depthCm', label: '深', type: 'number', min: 25, max: 90, step: 1, unit: 'cm', default: 45 },
    { key: 'seatHeightCm', label: '座面高', type: 'number', min: 25, max: 90, step: 1, unit: 'cm', default: 45 },
    { key: 'backHeightCm', label: '椅背高', type: 'number', min: 0, max: 70, step: 1, unit: 'cm', default: 40 },
    { key: 'legThicknessCm', label: '腳粗細', type: 'number', min: 2, max: 8, step: 0.5, unit: 'cm', default: 4 },
  ],
  surfaces: [
    { id: 'seat', label: '座面與椅背', defaultFinish: 'matte' },
    { id: 'frame', label: '骨架', defaultFinish: 'brushedMetal' },
  ],
  Render,
  defaultTransform: { position: [1.2, 0, 0.8], rotationY: 0 },
}
