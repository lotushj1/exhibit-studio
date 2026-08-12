import { describe, expect, it } from 'vitest'
import { getDef } from '../objects/registry'
import {
  PRESET_METADATA,
  createPresetScene,
  footprintOverlap,
  getPresetMetadata,
  needsPresetReplacementConfirmation,
  presetAppliedMessage,
  type PresetId,
} from './index'

const ids: PresetId[] = ['brand-wall', 'glass-cabinet', 'retail-display', 'small-meeting']

describe('場景範本 metadata', () => {
  it('提供四個不可變的常見範本', () => {
    expect(PRESET_METADATA).toHaveLength(4)
    expect(PRESET_METADATA.map((preset) => preset.id)).toEqual(ids)
    for (const preset of PRESET_METADATA) {
      expect(preset.title).toBeTruthy()
      expect(preset.description).toBeTruthy()
      expect(preset.objects.length).toBeGreaterThan(0)
      expect(Object.isFrozen(preset)).toBe(true)
    }
  })
})

describe('createPresetScene', () => {
  it.each(ids)('%s 的物件種類、數量與完整 defaults 合法', (id) => {
    const metadata = getPresetMetadata(id)!
    const scene = createPresetScene(id)!
    const actualSummary = scene.objects.reduce<Record<string, number>>((counts, object) => {
      counts[object.kind] = (counts[object.kind] ?? 0) + 1
      return counts
    }, {})

    expect(actualSummary).toEqual(
      Object.fromEntries(metadata.objects.map((item) => [item.kind, item.count])),
    )
    expect(new Set(scene.objects.map((object) => object.id)).size).toBe(scene.objects.length)
    for (const object of scene.objects) {
      const def = getDef(object.kind)
      expect(Number.isFinite(object.transform.position[0])).toBe(true)
      expect(Number.isFinite(object.transform.position[1])).toBe(true)
      expect(Number.isFinite(object.transform.position[2])).toBe(true)
      expect(object.transform.position[1]).toBeGreaterThanOrEqual(0)
      expect(object.transform.rotationY).toBeGreaterThanOrEqual(-Math.PI * 2)
      expect(object.transform.rotationY).toBeLessThanOrEqual(Math.PI * 2)
      for (const parameter of def.schema) {
        expect(object.params[parameter.key]).toEqual(expect.anything())
        if (parameter.type === 'number') {
          expect(object.params[parameter.key]).toBeGreaterThanOrEqual(parameter.min!)
          expect(object.params[parameter.key]).toBeLessThanOrEqual(parameter.max!)
        }
        if (parameter.type === 'select') {
          expect(parameter.options!.map((option) => option.value)).toContain(object.params[parameter.key])
        }
      }
      expect(Object.keys(object.surfaces).every((surfaceId) => def.surfaces.some((surface) => surface.id === surfaceId))).toBe(true)
      expect(Object.values(object.surfaces).every((surface) => surface.texture === undefined)).toBe(true)
    }

    for (let i = 0; i < scene.objects.length; i += 1) {
      for (let j = i + 1; j < scene.objects.length; j += 1) {
        expect(footprintOverlap(scene.objects[i], scene.objects[j])).toBe(false)
      }
    }
  })

  it('每次建立同一範本都重新產生 ID 與深獨立資料', () => {
    const first = createPresetScene('brand-wall')!
    const second = createPresetScene('brand-wall')!
    expect(first.objects.map((object) => object.id)).not.toEqual(second.objects.map((object) => object.id))
    expect(first.objects[0]).not.toBe(second.objects[0])
    expect(first.objects[0].params).not.toBe(second.objects[0].params)
    expect(first.objects[0].surfaces).not.toBe(second.objects[0].surfaces)
    first.objects[0].params.widthCm = 999
    expect(second.objects[0].params.widthCm).not.toBe(999)
  })

  it('未知 id 安全回傳 null', () => {
    expect(createPresetScene('not-a-preset' as PresetId)).toBeNull()
    expect(getPresetMetadata('not-a-preset' as PresetId)).toBeNull()
    expect(getPresetMetadata('toString')).toBeNull()
  })
})

describe('範本套用 UI decision helpers', () => {
  it('只有非空場景需要確認', () => {
    expect(needsPresetReplacementConfirmation(0)).toBe(false)
    expect(needsPresetReplacementConfirmation(1)).toBe(true)
    expect(needsPresetReplacementConfirmation(-1)).toBe(false)
  })

  it('產生穩定的套用成功文案', () => {
    expect(presetAppliedMessage('品牌展示牆', 4)).toBe('已套用「品牌展示牆」範本，共 4 個物件')
  })
})
