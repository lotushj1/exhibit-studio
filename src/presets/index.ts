import { createObject } from '../objects/registry'
import type { ObjectKind, ParamValue, SceneObject } from '../objects/types'

/** 四個內建範本的穩定識別碼。 */
export type PresetId = 'brand-wall' | 'glass-cabinet' | 'retail-display' | 'small-meeting'

export type PresetObjectSummary = Readonly<{
  kind: ObjectKind
  label: string
  count: number
}>

export type PresetMetadata = Readonly<{
  id: PresetId
  title: string
  description: string
  objects: readonly PresetObjectSummary[]
}>

export type PresetScene = {
  projectName: string
  objects: SceneObject[]
}

const metadata = [
  {
    id: 'brand-wall',
    title: '品牌展示牆',
    description: '主視覺背板搭配雙展台與假人，適合品牌活動／快閃店。',
    objects: [
      { kind: 'backWall', label: '主視覺背板', count: 1 },
      { kind: 'boxPlinth', label: '方箱展台', count: 2 },
      { kind: 'humanFigure', label: '假人', count: 1 },
    ],
  },
  {
    id: 'glass-cabinet',
    title: '商品玻璃櫃',
    description: '三座玻璃罩高櫃加上假人，適合珠寶、模型與收藏展示。',
    objects: [
      { kind: 'glassCase', label: '玻璃罩高櫃', count: 3 },
      { kind: 'humanFigure', label: '假人', count: 1 },
    ],
  },
  {
    id: 'retail-display',
    title: '零售陳列區',
    description: '雙開放層架、小櫃子與桌面立牌，適合選物店商品陳列。',
    objects: [
      { kind: 'openShelf', label: '開放層架', count: 2 },
      { kind: 'sideCabinet', label: '小櫃子', count: 1 },
      { kind: 'tableSign', label: '桌面立牌', count: 1 },
      { kind: 'humanFigure', label: '假人', count: 1 },
    ],
  },
  {
    id: 'small-meeting',
    title: '小型洽談區',
    description: '背板、小櫃子、雙椅與板凳，適合攤位接待與諮詢。',
    objects: [
      { kind: 'backWall', label: '主視覺背板', count: 1 },
      { kind: 'sideCabinet', label: '小櫃子', count: 1 },
      { kind: 'chair', label: '椅子', count: 2 },
      { kind: 'stool', label: '板凳', count: 1 },
      { kind: 'humanFigure', label: '假人', count: 1 },
    ],
  },
] satisfies ReadonlyArray<{
  id: PresetId
  title: string
  description: string
  objects: ReadonlyArray<PresetObjectSummary>
}>

function freezeMetadata(item: (typeof metadata)[number]): PresetMetadata {
  return Object.freeze({
    ...item,
    objects: Object.freeze(item.objects.map((object) => Object.freeze({ ...object }))),
  })
}

/** 左欄範本卡片使用的唯讀 metadata。 */
export const PRESET_METADATA: readonly PresetMetadata[] = Object.freeze(metadata.map(freezeMetadata))

const metadataById: Readonly<Record<PresetId, PresetMetadata>> = Object.freeze(
  Object.fromEntries(PRESET_METADATA.map((item) => [item.id, item])) as Record<PresetId, PresetMetadata>,
)

export function getPresetMetadata(id: string): PresetMetadata | null {
  if (!Object.prototype.hasOwnProperty.call(metadataById, id)) return null
  return metadataById[id as PresetId] ?? null
}

type ObjectPatch = {
  name: string
  position: [number, number, number]
  rotationY?: number
  params?: Partial<Record<string, ParamValue>>
  surfaceColors?: Record<string, string>
}

function configureObject(kind: ObjectKind, patch: ObjectPatch): SceneObject {
  const object = createObject(kind)
  object.name = patch.name
  object.transform = {
    position: [...patch.position],
    rotationY: patch.rotationY ?? 0,
  }

  // 只覆蓋 registry 已宣告的參數，避免範本偷偷建立不存在的 schema 欄位。
  for (const [key, value] of Object.entries(patch.params ?? {})) {
    if (value !== undefined && Object.prototype.hasOwnProperty.call(object.params, key)) object.params[key] = value
  }

  // 材質面也只從 createObject 的完整 defaults 中挑選存在的面來覆蓋。
  for (const [surfaceId, color] of Object.entries(patch.surfaceColors ?? {})) {
    const surface = object.surfaces[surfaceId]
    if (surface) object.surfaces[surfaceId] = { ...surface, color }
  }
  return object
}

function buildBrandWall(): SceneObject[] {
  return [
    configureObject('backWall', {
      name: '品牌背板',
      position: [0, 0, -1.35],
      params: { widthCm: 420, heightCm: 240, thicknessCm: 8 },
      surfaceColors: { front: '#294a83', edge: '#1d3158' },
    }),
    configureObject('boxPlinth', {
      name: '左方箱展台',
      position: [-1.2, 0, 0],
      params: { widthCm: 100, depthCm: 60, heightCm: 90, kickHeightCm: 8, kickInsetCm: 3 },
      surfaceColors: { top: '#e9eef8', left: '#d5deef', right: '#d5deef' },
    }),
    configureObject('boxPlinth', {
      name: '右方箱展台',
      position: [1.2, 0, 0],
      params: { widthCm: 100, depthCm: 60, heightCm: 90, kickHeightCm: 8, kickInsetCm: 3 },
      surfaceColors: { top: '#e9eef8', left: '#d5deef', right: '#d5deef' },
    }),
    configureObject('humanFigure', {
      name: '品牌展示假人',
      position: [0, 0, 0.65],
      params: { build: 'male', heightCm: 173, girth: 1 },
      surfaceColors: { body: '#c7ccd3' },
    }),
  ]
}

function buildGlassCabinet(): SceneObject[] {
  return [
    configureObject('glassCase', {
      name: '左玻璃罩高櫃',
      position: [-1.25, 0, 0],
      params: { widthCm: 80, depthCm: 50, baseHeightCm: 90, glassHeightCm: 80, shelfCount: 1 },
      surfaceColors: { glass: '#eef8ff' },
    }),
    configureObject('glassCase', {
      name: '中玻璃罩高櫃',
      position: [0, 0, 0],
      params: { widthCm: 80, depthCm: 50, baseHeightCm: 90, glassHeightCm: 80, shelfCount: 1 },
      surfaceColors: { glass: '#eef8ff' },
    }),
    configureObject('glassCase', {
      name: '右玻璃罩高櫃',
      position: [1.25, 0, 0],
      params: { widthCm: 80, depthCm: 50, baseHeightCm: 90, glassHeightCm: 80, shelfCount: 1 },
      surfaceColors: { glass: '#eef8ff' },
    }),
    configureObject('humanFigure', {
      name: '收藏展示假人',
      position: [0, 0, 0.9],
      params: { build: 'female', heightCm: 165, girth: 0.95 },
      surfaceColors: { body: '#c7ccd3' },
    }),
  ]
}

function buildRetailDisplay(): SceneObject[] {
  return [
    configureObject('openShelf', {
      name: '左開放層架',
      position: [-1.5, 0, 0],
      params: { widthCm: 100, depthCm: 35, heightCm: 180, shelfCount: 4, hasBackPanel: true },
      surfaceColors: { side: '#d2b18a', shelf: '#e1c7a4' },
    }),
    configureObject('openShelf', {
      name: '右開放層架',
      position: [1.5, 0, 0],
      params: { widthCm: 100, depthCm: 35, heightCm: 180, shelfCount: 4, hasBackPanel: true },
      surfaceColors: { side: '#d2b18a', shelf: '#e1c7a4' },
    }),
    configureObject('sideCabinet', {
      name: '零售小櫃子',
      position: [0, 0, 0],
      params: { widthCm: 80, depthCm: 40, heightCm: 75, doorCount: 2 },
      surfaceColors: { front: '#ded6c8', door: '#b88e5b' },
    }),
    configureObject('tableSign', {
      name: '商品桌面立牌',
      position: [0, 0.75, 0],
      params: { widthCm: 15, heightCm: 21, tiltDeg: 12 },
      surfaceColors: { front: '#234b7a' },
    }),
    configureObject('humanFigure', {
      name: '零售展示假人',
      position: [0, 0, 0.85],
      params: { build: 'female', heightCm: 165, girth: 1 },
      surfaceColors: { body: '#c7ccd3' },
    }),
  ]
}

function buildSmallMeeting(): SceneObject[] {
  return [
    configureObject('backWall', {
      name: '洽談區背板',
      position: [0, 0, -1.3],
      params: { widthCm: 320, heightCm: 220, thicknessCm: 8 },
      surfaceColors: { front: '#38536e', edge: '#27394c' },
    }),
    configureObject('sideCabinet', {
      name: '洽談區小櫃子',
      position: [-1.1, 0, -0.35],
      params: { widthCm: 80, depthCm: 40, heightCm: 75, doorCount: 2 },
      surfaceColors: { front: '#ded6c8', door: '#b88e5b' },
    }),
    configureObject('chair', {
      name: '左洽談椅',
      position: [-0.45, 0, 0.55],
      params: { widthCm: 45, depthCm: 45, seatHeightCm: 45, backHeightCm: 40 },
      surfaceColors: { seat: '#315d88' },
    }),
    configureObject('chair', {
      name: '右洽談椅',
      position: [0.45, 0, 0.55],
      params: { widthCm: 45, depthCm: 45, seatHeightCm: 45, backHeightCm: 40 },
      surfaceColors: { seat: '#315d88' },
    }),
    configureObject('stool', {
      name: '洽談板凳',
      position: [0, 0, -0.45],
      params: { diameterCm: 34, heightCm: 45, legThicknessCm: 3 },
      surfaceColors: { seat: '#b88e5b' },
    }),
    configureObject('humanFigure', {
      name: '接待假人',
      position: [1.2, 0, -0.2],
      params: { build: 'male', heightCm: 173, girth: 1 },
      surfaceColors: { body: '#c7ccd3' },
    }),
  ]
}

const BUILDERS: Readonly<Record<PresetId, () => SceneObject[]>> = {
  'brand-wall': buildBrandWall,
  'glass-cabinet': buildGlassCabinet,
  'retail-display': buildRetailDisplay,
  'small-meeting': buildSmallMeeting,
}

/** 建立一份全新的範本場景；未知 id 回傳 null。 */
export function createPresetScene(id: string): PresetScene | null {
  const item = getPresetMetadata(id)
  const builder = BUILDERS[id as PresetId]
  if (!item || !builder) return null
  return { projectName: item.title, objects: builder() }
}

export function needsPresetReplacementConfirmation(objectCount: number): boolean {
  return objectCount > 0
}

export function presetAppliedMessage(title: string, count: number): string {
  return `已套用「${title}」範本，共 ${count} 個物件`
}

export type PresetObjectBounds = Readonly<{
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}>

function numberParam(object: SceneObject, key: string, fallback: number): number {
  const value = object.params[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function rotatedHalfExtents(width: number, depth: number, rotationY: number): [number, number] {
  const c = Math.abs(Math.cos(rotationY))
  const s = Math.abs(Math.sin(rotationY))
  return [width * c + depth * s, width * s + depth * c]
}

/**
 * 取得範本物件的保守佔用邊界（公尺）。這是碰撞測試用的 3D footprint：
 * 上下堆疊只在邊界接觸時不算重疊，因此桌面立牌可以安全放在小櫃子上。
 */
export function presetObjectBounds(object: SceneObject): PresetObjectBounds {
  const px = object.transform.position[0]
  const py = object.transform.position[1]
  const pz = object.transform.position[2]
  let width = 0.5
  let depth = 0.5
  let height = 1

  switch (object.kind) {
    case 'backWall':
      width = numberParam(object, 'widthCm', 300) / 100
      depth = numberParam(object, 'thicknessCm', 8) / 100
      height = numberParam(object, 'heightCm', 250) / 100
      break
    case 'boxPlinth':
      width = numberParam(object, 'widthCm', 120) / 100
      depth = numberParam(object, 'depthCm', 60) / 100
      height = numberParam(object, 'heightCm', 90) / 100
      break
    case 'glassCase':
      width = numberParam(object, 'widthCm', 80) / 100
      depth = numberParam(object, 'depthCm', 50) / 100
      height = (numberParam(object, 'baseHeightCm', 90) + numberParam(object, 'glassHeightCm', 70)) / 100
      break
    case 'openShelf':
      width = numberParam(object, 'widthCm', 100) / 100
      depth = numberParam(object, 'depthCm', 35) / 100
      height = numberParam(object, 'heightCm', 180) / 100
      break
    case 'humanFigure':
      width = 0.7
      depth = 0.45
      height = numberParam(object, 'heightCm', 173) / 100
      break
    case 'chair':
      width = numberParam(object, 'widthCm', 45) / 100
      depth = numberParam(object, 'depthCm', 45) / 100
      height = (numberParam(object, 'seatHeightCm', 45) + numberParam(object, 'backHeightCm', 40)) / 100
      break
    case 'stool':
      width = numberParam(object, 'diameterCm', 34) / 100
      depth = width
      height = numberParam(object, 'heightCm', 45) / 100
      break
    case 'sideCabinet':
      width = numberParam(object, 'widthCm', 80) / 100
      depth = numberParam(object, 'depthCm', 40) / 100
      height = numberParam(object, 'heightCm', 75) / 100
      break
    case 'tableSign':
      width = numberParam(object, 'widthCm', 15) / 100
      depth = 0.004
      height = numberParam(object, 'heightCm', 21) / 100
      break
    case 'crate':
      width = numberParam(object, 'widthCm', 50) / 100
      depth = numberParam(object, 'depthCm', 40) / 100
      height = numberParam(object, 'heightCm', 40) / 100
      break
  }

  const [halfWidth, halfDepth] = rotatedHalfExtents(width, depth, object.transform.rotationY)
  return {
    minX: px - halfWidth / 2,
    maxX: px + halfWidth / 2,
    minY: py,
    maxY: py + height,
    minZ: pz - halfDepth / 2,
    maxZ: pz + halfDepth / 2,
  }
}

function axisOverlap(minA: number, maxA: number, minB: number, maxB: number): boolean {
  // 邊界相接（例如立牌落在櫃面上）是合法的，不算體積重疊。
  return minA < maxB && minB < maxA
}

/** 判斷兩個範本物件的佔用邊界是否真的互相穿入。 */
export function footprintOverlap(a: SceneObject, b: SceneObject): boolean {
  const first = presetObjectBounds(a)
  const second = presetObjectBounds(b)
  return (
    axisOverlap(first.minX, first.maxX, second.minX, second.maxX) &&
    axisOverlap(first.minY, first.maxY, second.minY, second.maxY) &&
    axisOverlap(first.minZ, first.maxZ, second.minZ, second.maxZ)
  )
}
