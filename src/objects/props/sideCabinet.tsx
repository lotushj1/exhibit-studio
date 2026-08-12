import { cmToM } from '../../lib/units'
import { SurfaceMaterial } from '../../materials/SurfaceMaterial'
import { TexturedBox, BOX_SURFACES } from '../shared/TexturedBox'
import { num } from '../types'
import type { ObjectDef, ObjectRenderProps, SurfaceSpec } from '../types'

const FALLBACK: SurfaceSpec = { finish: 'matte', color: '#c8ccd0' }

/** 門片之間、以及門片與箱體邊緣之間的縫隙，固定 1 公分。 */
export const SIDE_CABINET_DOOR_GAP_CM = 1
/** 門片貼在箱體正面外側的距離，固定 0.5 公分，只做出視覺分隔用的薄片。 */
export const SIDE_CABINET_DOOR_OFFSET_CM = 0.5
/** 門片厚度，固定 1 公分（只是薄片，不佔用箱體內部空間）。 */
export const SIDE_CABINET_DOOR_THICKNESS_CM = 1

/**
 * 單片門片的寬度：扣掉 `doorCount + 1` 條縫隙後平分給每片門。
 * 在 schema 範圍內（寬最小 20、門片數最多 4、縫隙固定 1）分母與分子
 * 恆為正（20 - 1*5 = 15 > 0），但這裡仍用 `Math.max` 防禦，避免
 * `doorCount` 為 0 時除以 0。
 */
export function sideCabinetDoorWidthCm(widthCm: number, doorCount: number, gapCm: number): number {
  if (doorCount <= 0) return 0
  return (widthCm - gapCm * (doorCount + 1)) / doorCount
}

export type SideCabinetDoorSpec = {
  id: string
  /** 公分，物件本地座標，門片中心點的 X 座標。 */
  centerXCm: number
  widthCm: number
  heightCm: number
}

/**
 * 每片門片的水平佈局（公分，物件本地座標），彼此之間、以及跟箱體
 * 左右邊緣之間都恰好留 `gapCm` 的縫隙，不會互相重疊。高度上下各留
 * `gapCm`，讓門片嵌在箱體正面範圍內，不會凸出箱體的頂/底面。
 */
export function sideCabinetDoors(
  widthCm: number,
  heightCm: number,
  doorCount: number,
  gapCm: number,
): SideCabinetDoorSpec[] {
  const doorWidthCm = sideCabinetDoorWidthCm(widthCm, doorCount, gapCm)
  const doorHeightCm = Math.max(0, heightCm - gapCm * 2)
  const doors: SideCabinetDoorSpec[] = []
  for (let i = 0; i < doorCount; i++) {
    const centerXCm = -widthCm / 2 + gapCm * (i + 1) + doorWidthCm * (i + 0.5)
    doors.push({ id: `door-${i}`, centerXCm, widthCm: doorWidthCm, heightCm: doorHeightCm })
  }
  return doors
}

function Render({ params, surfaces }: ObjectRenderProps) {
  const w = num(params, 'widthCm')
  const d = num(params, 'depthCm')
  const h = num(params, 'heightCm')
  const doorCount = Math.round(num(params, 'doorCount'))

  const door = surfaces.door ?? FALLBACK
  const doors = sideCabinetDoors(w, h, doorCount, SIDE_CABINET_DOOR_GAP_CM)
  const doorZCm = d / 2 + SIDE_CABINET_DOOR_OFFSET_CM

  return (
    <group>
      <TexturedBox
        widthCm={w}
        heightCm={h}
        depthCm={d}
        surfaces={surfaces}
        position={[0, cmToM(h / 2), 0]}
      />

      {/* 門片：貼在箱體正面外側，做出分割線，跟箱體只共用一個面、不重疊 */}
      {doors.map((doorSpec) => (
        <mesh
          key={doorSpec.id}
          position={[cmToM(doorSpec.centerXCm), cmToM(h / 2), cmToM(doorZCm)]}
          castShadow
        >
          <boxGeometry
            args={[cmToM(doorSpec.widthCm), cmToM(doorSpec.heightCm), cmToM(SIDE_CABINET_DOOR_THICKNESS_CM)]}
          />
          <SurfaceMaterial spec={door} widthCm={doorSpec.widthCm} heightCm={doorSpec.heightCm} />
        </mesh>
      ))}
    </group>
  )
}

export const sideCabinetDef: ObjectDef = {
  kind: 'sideCabinet',
  label: '小櫃子',
  category: 'prop',
  schema: [
    { key: 'widthCm', label: '寬', type: 'number', min: 20, max: 200, step: 1, unit: 'cm', default: 80 },
    { key: 'depthCm', label: '深', type: 'number', min: 20, max: 90, step: 1, unit: 'cm', default: 40 },
    { key: 'heightCm', label: '高', type: 'number', min: 30, max: 200, step: 1, unit: 'cm', default: 75 },
    { key: 'doorCount', label: '門片數量', type: 'number', min: 0, max: 4, step: 1, unit: '', default: 2 },
  ],
  surfaces: [
    ...BOX_SURFACES,
    { id: 'door', label: '門片', defaultFinish: 'gloss' },
  ],
  Render,
  defaultTransform: { position: [-1.6, 0, 0], rotationY: 0 },
}
