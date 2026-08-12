import { clamp, cmToM } from '../../lib/units'
import { BOX_FACE_ORDER, TexturedBox, BOX_SURFACES } from '../shared/TexturedBox'
import { num } from '../types'
import type { ObjectDef, ObjectRenderProps, SurfaceSpec } from '../types'

const KICK_FALLBACK: SurfaceSpec = { finish: 'matte', color: '#d8d8d8' }

/**
 * 把使用者輸入的總高拆成本體高與踢腳高，兩者相加永遠等於 `heightCm`。
 * 踢腳高度會被夾在 `[0, heightCm - 1]` 之間，確保本體至少留下 1 公分，
 * 不會發生「本體被壓到 1 公分、但總高超過使用者輸入值」的情況。
 */
export function plinthHeights(
  heightCm: number,
  kickHeightCm: number,
): { bodyHeightCm: number; kickHeightCm: number } {
  const kick = clamp(kickHeightCm, 0, Math.max(0, heightCm - 1))
  return { bodyHeightCm: heightCm - kick, kickHeightCm: kick }
}

/**
 * 把使用者輸入的踢腳內縮值夾到合理範圍，避免寬或深較小時
 * 內縮把踢腳壓成一根細柱：內縮上限是寬深較小者的一半再退 2 公分。
 */
export function plinthKickInset(widthCm: number, depthCm: number, kickInsetCm: number): number {
  const maxInset = Math.max(0, Math.min(widthCm, depthCm) / 2 - 2)
  return clamp(kickInsetCm, 0, maxInset)
}

function Render({ params, surfaces }: ObjectRenderProps) {
  const w = num(params, 'widthCm')
  const h = num(params, 'heightCm')
  const d = num(params, 'depthCm')
  const { bodyHeightCm: bodyHeight, kickHeightCm: kickHeight } = plinthHeights(
    h,
    num(params, 'kickHeightCm'),
  )
  const kickInset = plinthKickInset(w, d, num(params, 'kickInsetCm'))
  const hasKick = kickHeight > 0

  // 踢腳是獨立於本體六面的材質組，不透過 fallback 借用本體的面；
  // 使用者沒特別設定「踢腳」材質時，六面都用同一份中性灰後備值。
  const kickSpec = surfaces.kick ?? KICK_FALLBACK
  const kickSurfaces = Object.fromEntries(BOX_FACE_ORDER.map((face) => [face, kickSpec]))

  return (
    <group>
      {/* 主箱體，底部座落在踢腳之上 */}
      <TexturedBox
        widthCm={w}
        heightCm={bodyHeight}
        depthCm={d}
        surfaces={surfaces}
        position={[0, cmToM(kickHeight + bodyHeight / 2), 0]}
      />
      {/* 踢腳：內縮的深色底座，讓展台看起來像浮起來 */}
      {hasKick && (
        <TexturedBox
          widthCm={w - kickInset * 2}
          heightCm={kickHeight}
          depthCm={d - kickInset * 2}
          surfaces={kickSurfaces}
          position={[0, cmToM(kickHeight / 2), 0]}
        />
      )}
    </group>
  )
}

export const boxPlinthDef: ObjectDef = {
  kind: 'boxPlinth',
  label: '方箱展台',
  category: 'case',
  schema: [
    { key: 'widthCm', label: '寬', type: 'number', min: 10, max: 600, step: 1, unit: 'cm', default: 120 },
    { key: 'depthCm', label: '深', type: 'number', min: 10, max: 400, step: 1, unit: 'cm', default: 60 },
    { key: 'heightCm', label: '高', type: 'number', min: 10, max: 300, step: 1, unit: 'cm', default: 90 },
    { key: 'kickHeightCm', label: '踢腳高度', type: 'number', min: 0, max: 40, step: 1, unit: 'cm', default: 8 },
    {
      key: 'kickInsetCm', label: '踢腳內縮', type: 'number', min: 0, max: 20, step: 1, unit: 'cm', default: 3,
      visibleWhen: (p) => num(p, 'kickHeightCm') > 0,
    },
  ],
  surfaces: [
    ...BOX_SURFACES,
    { id: 'kick', label: '踢腳', defaultFinish: 'matte' },
  ],
  Render,
  defaultTransform: { position: [0, 0, 0], rotationY: 0 },
}
