import { cmToM } from '../../lib/units'
import { TexturedBox, BOX_SURFACES } from '../shared/TexturedBox'
import { num } from '../types'
import type { ObjectDef, ObjectRenderProps } from '../types'

/**
 * 單一箱體，直接沿用 `TexturedBox`：六面各自的真實尺寸（含貼圖不變形）
 * 已經在 `TexturedBox` 內部靠 `surfaceSizeCm` 算好並經過測試，這裡不需要
 * 額外的幾何契約或純函式。
 */
function Render({ params, surfaces }: ObjectRenderProps) {
  const w = num(params, 'widthCm')
  const d = num(params, 'depthCm')
  const h = num(params, 'heightCm')

  return (
    <TexturedBox
      widthCm={w}
      heightCm={h}
      depthCm={d}
      surfaces={surfaces}
      position={[0, cmToM(h / 2), 0]}
    />
  )
}

export const crateDef: ObjectDef = {
  kind: 'crate',
  label: '箱子',
  category: 'prop',
  schema: [
    { key: 'widthCm', label: '寬', type: 'number', min: 10, max: 200, step: 1, unit: 'cm', default: 50 },
    { key: 'depthCm', label: '深', type: 'number', min: 10, max: 200, step: 1, unit: 'cm', default: 40 },
    { key: 'heightCm', label: '高', type: 'number', min: 10, max: 200, step: 1, unit: 'cm', default: 40 },
  ],
  surfaces: BOX_SURFACES,
  Render,
  defaultTransform: { position: [0, 0, 1.2], rotationY: 0 },
}
