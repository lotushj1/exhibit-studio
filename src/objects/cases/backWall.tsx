import { clamp, cmToM } from '../../lib/units'
import { TexturedBox } from '../shared/TexturedBox'
import { num } from '../types'
import type { ObjectDef, ObjectRenderProps, SurfaceSpec } from '../types'

const FRONT_FALLBACK: SurfaceSpec = { finish: 'matte', color: '#e8e8e8' }
const BACK_FALLBACK: SurfaceSpec = { finish: 'matte', color: '#e8e8e8' }
const EDGE_FALLBACK: SurfaceSpec = { finish: 'matte', color: '#d8d8d8' }

/**
 * 背板中心點的世界 Y 座標（公尺）。
 * `liftCm` 是底面離地高度，夾在 >= 0，避免負值把背板底面塞進地板以下；
 * 中心點永遠是「離地高度 + 半個高度」，所以底面剛好落在 `liftCm` 那個高度，
 * 不會因為離地高度而讓總高變多或變少。
 */
export function backWallCenterYM(heightCm: number, liftCm: number): number {
  const lift = clamp(liftCm, 0, Infinity)
  return cmToM(lift) + cmToM(heightCm) / 2
}

function Render({ params, surfaces }: ObjectRenderProps) {
  const w = num(params, 'widthCm')
  const h = num(params, 'heightCm')
  const t = num(params, 'thicknessCm')
  const lift = num(params, 'liftCm')

  const front = surfaces.front ?? FRONT_FALLBACK
  const back = surfaces.back ?? BACK_FALLBACK
  const edge = surfaces.edge ?? EDGE_FALLBACK

  // 背板是單一箱體，六面材質透過 TexturedBox 逐面計算真實尺寸
  // （正背面 = 寬x高，四個邊面 = 寬/深 x 厚度），四個邊面共用同一份
  // 「側邊」材質，不需要使用者分別設定四種厚度面。
  const boxSurfaces: Record<string, SurfaceSpec> = {
    front,
    back,
    left: edge,
    right: edge,
    top: edge,
    bottom: edge,
  }

  return (
    <TexturedBox
      widthCm={w}
      heightCm={h}
      depthCm={t}
      surfaces={boxSurfaces}
      position={[0, backWallCenterYM(h, lift), 0]}
    />
  )
}

export const backWallDef: ObjectDef = {
  kind: 'backWall',
  label: '主視覺背板',
  category: 'case',
  schema: [
    { key: 'widthCm', label: '寬', type: 'number', min: 50, max: 1200, step: 1, unit: 'cm', default: 300 },
    { key: 'heightCm', label: '高', type: 'number', min: 50, max: 500, step: 1, unit: 'cm', default: 250 },
    { key: 'thicknessCm', label: '厚度', type: 'number', min: 1, max: 40, step: 1, unit: 'cm', default: 8 },
    { key: 'liftCm', label: '離地高度', type: 'number', min: 0, max: 200, step: 1, unit: 'cm', default: 0 },
  ],
  surfaces: [
    { id: 'front', label: '正面（主視覺）', defaultFinish: 'matte' },
    { id: 'back', label: '背面', defaultFinish: 'matte' },
    { id: 'edge', label: '側邊', defaultFinish: 'matte' },
  ],
  Render,
  defaultTransform: { position: [0, 0, -1.5], rotationY: 0 },
}
