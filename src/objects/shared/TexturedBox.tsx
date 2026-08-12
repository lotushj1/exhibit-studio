import { SurfaceMaterial } from '../../materials/SurfaceMaterial'
import { boxSizeM, surfaceSizeCm, type BoxFace } from './geometry'
import type { SurfaceDef, SurfaceSpec } from '../types'

/** Three.js BoxGeometry 的材質索引順序：+X, -X, +Y, -Y, +Z, -Z。 */
export const BOX_FACE_ORDER: BoxFace[] = ['right', 'left', 'top', 'bottom', 'front', 'back']

export const BOX_SURFACES: SurfaceDef[] = [
  { id: 'front', label: '正面', defaultFinish: 'matte' },
  { id: 'back', label: '背面', defaultFinish: 'matte' },
  { id: 'left', label: '左側', defaultFinish: 'matte' },
  { id: 'right', label: '右側', defaultFinish: 'matte' },
  { id: 'top', label: '頂面', defaultFinish: 'matte' },
  { id: 'bottom', label: '底面', defaultFinish: 'matte' },
]

type Props = {
  widthCm: number
  heightCm: number
  depthCm: number
  surfaces: Record<string, SurfaceSpec>
  /** 公尺，箱體中心位置。 */
  position?: [number, number, number]
}

const FALLBACK: SurfaceSpec = { finish: 'matte', color: '#d8d8d8' }

/**
 * 六面各自獨立上材質與貼圖的箱體。
 * 每一面的貼圖依該面的實際長寬比計算，不會被拉變形。
 * `surfaces` 必須是呼叫端已經為這個箱體組好的六面材質表；
 * 若某一面缺席就用中性灰的 `FALLBACK`，不會去讀其他面的材質。
 */
export function TexturedBox({
  widthCm, heightCm, depthCm, surfaces, position = [0, 0, 0],
}: Props) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={boxSizeM(widthCm, heightCm, depthCm)} />
      {BOX_FACE_ORDER.map((face, i) => {
        const size = surfaceSizeCm(face, widthCm, heightCm, depthCm)
        const spec = surfaces[face] ?? FALLBACK
        return (
          <SurfaceMaterial
            key={face}
            attach={`material-${i}`}
            spec={spec}
            widthCm={size.widthCm}
            heightCm={size.heightCm}
          />
        )
      })}
    </mesh>
  )
}
