import { cmToM } from '../../lib/units'
import { TexturedBox } from '../shared/TexturedBox'
import { num } from '../types'
import type { ObjectDef, ObjectRenderProps, SurfaceSpec } from '../types'

const FALLBACK: SurfaceSpec = { finish: 'matte', color: '#f0f0f0' }

/** 立牌厚度固定 0.4 公分，是設計選擇不開放調整。 */
export const TABLE_SIGN_THICKNESS_CM = 0.4

/**
 * 立牌其實就是一片薄箱體，正面／背面／四個窄邊分屬三種材質。
 * 直接沿用 `TexturedBox`（六面各自的真實尺寸已經由 `surfaceSizeCm`
 * 算好並經過測試），不再手動組 `material-0` 到 `material-5`：
 * 手動組法容易在面的順序或寬高對調上出錯（`BOX_FACE_ORDER` 的順序是
 * +X, -X, +Y, -Y, +Z, -Z，跟直覺的「正面在前」不一致），交給
 * `TexturedBox` 可以完全消除這類錯誤。
 */
function Render({ params, surfaces }: ObjectRenderProps) {
  const w = num(params, 'widthCm')
  const h = num(params, 'heightCm')
  const tilt = num(params, 'tiltDeg')

  const front = surfaces.front ?? FALLBACK
  const back = surfaces.back ?? FALLBACK
  const edge = surfaces.edge ?? FALLBACK

  const boxSurfaces: Record<string, SurfaceSpec> = {
    front,
    back,
    left: edge,
    right: edge,
    top: edge,
    bottom: edge,
  }

  const tiltRad = (tilt * Math.PI) / 180

  return (
    <group rotation={[tiltRad, 0, 0]}>
      <TexturedBox
        widthCm={w}
        heightCm={h}
        depthCm={TABLE_SIGN_THICKNESS_CM}
        surfaces={boxSurfaces}
        position={[0, cmToM(h / 2), 0]}
      />
    </group>
  )
}

export const tableSignDef: ObjectDef = {
  kind: 'tableSign',
  label: '桌面立牌',
  category: 'prop',
  schema: [
    { key: 'widthCm', label: '寬', type: 'number', min: 5, max: 60, step: 1, unit: 'cm', default: 15 },
    { key: 'heightCm', label: '高', type: 'number', min: 5, max: 80, step: 1, unit: 'cm', default: 21 },
    { key: 'tiltDeg', label: '後仰角度', type: 'number', min: 0, max: 30, step: 1, unit: 'deg', default: 12 },
  ],
  surfaces: [
    { id: 'front', label: '正面', defaultFinish: 'matte' },
    { id: 'back', label: '背面', defaultFinish: 'matte' },
    { id: 'edge', label: '側邊', defaultFinish: 'matte' },
  ],
  Render,
  defaultTransform: { position: [0, 0.9, 0], rotationY: 0 },
}
