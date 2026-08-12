import { describe, it, expect } from 'vitest'
import { FINISHES, FINISH_ORDER, resolveFinish } from './finishes'

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('finishes', () => {
  it('FINISH_ORDER 涵蓋所有 FINISHES 且無重複', () => {
    const keys = Object.keys(FINISHES).sort()
    expect([...FINISH_ORDER].sort()).toEqual(keys)
    expect(new Set(FINISH_ORDER).size).toBe(FINISH_ORDER.length)
  })

  it('每個 finish 都有繁體中文標籤', () => {
    for (const id of FINISH_ORDER) {
      expect(FINISHES[id].label.length).toBeGreaterThan(0)
    }
  })

  it('不透明材質不受高品質玻璃開關影響', () => {
    for (const id of ['matte', 'gloss', 'goldFoil', 'silverFoil', 'brushedMetal', 'wood'] as const) {
      expect(resolveFinish(id, false)).toEqual(resolveFinish(id, true))
    }
  })

  it('玻璃在關閉高品質時不使用 transmission', () => {
    for (const id of ['acrylic', 'clearGlass', 'frostedGlass'] as const) {
      const props = resolveFinish(id, false)
      expect(props.transmission ?? 0).toBe(0)
      expect(props.transparent).toBe(true)
      expect(props.opacity).toBeLessThan(1)
    }
  })

  it('玻璃在開啟高品質時使用 transmission 與 ior', () => {
    const glass = resolveFinish('clearGlass', true)
    expect(glass.transmission).toBe(1)
    expect(glass.ior).toBeCloseTo(1.52, 5)
    expect(glass.thickness).toBeGreaterThan(0)
  })

  it('金屬材質 metalness 為 1', () => {
    for (const id of ['goldFoil', 'silverFoil', 'brushedMetal'] as const) {
      expect(resolveFinish(id, false).metalness).toBe(1)
    }
  })

  it('roughness 與 metalness 都落在 0 到 1', () => {
    for (const hq of [false, true]) {
      for (const id of FINISH_ORDER) {
        const p = resolveFinish(id, hq)
        expect(p.roughness).toBeGreaterThanOrEqual(0)
        expect(p.roughness).toBeLessThanOrEqual(1)
        expect(p.metalness).toBeGreaterThanOrEqual(0)
        expect(p.metalness).toBeLessThanOrEqual(1)
      }
    }
  })

  it('淺色場景中，預設霧面與亮面櫃體和背景有足夠圖形分離', () => {
    const lightSceneBackground = '#e4e7eb'
    for (const id of ['matte', 'gloss'] as const) {
      expect(contrastRatio(FINISHES[id].suggestedColor, lightSceneBackground)).toBeGreaterThanOrEqual(2.9)
    }
  })
})
