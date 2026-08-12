import { describe, it, expect } from 'vitest'
import { computeProportions, BUILD_PRESETS } from './proportions'

describe('BUILD_PRESETS', () => {
  it('三種體型都有中文標籤與合理預設身高', () => {
    for (const key of ['male', 'female', 'child'] as const) {
      const p = BUILD_PRESETS[key]
      expect(p.label.length).toBeGreaterThan(0)
      expect(p.label).not.toMatch(/[—–]/)
      expect(p.defaultHeightCm).toBeGreaterThan(80)
      expect(p.defaultHeightCm).toBeLessThan(200)
    }
  })

  it('兒童預設身高低於成人', () => {
    expect(BUILD_PRESETS.child.defaultHeightCm).toBeLessThan(BUILD_PRESETS.female.defaultHeightCm)
  })
})

describe('computeProportions', () => {
  it('各部位高度加總等於總身高', () => {
    for (const h of [90, 120, 160, 175, 195]) {
      const p = computeProportions(h, 'male', 1)
      const total = p.legHeightCm + p.torsoHeightCm + p.neckHeightCm + p.headHeightCm
      expect(total).toBeCloseTo(h, 4)
    }
  })

  it('頭頂 Y 位置等於總身高', () => {
    const p = computeProportions(170, 'female', 1)
    expect(p.headCenterYCm + p.headHeightCm / 2).toBeCloseTo(170, 4)
  })

  it('所有尺寸都是正數', () => {
    for (const preset of ['male', 'female', 'child'] as const) {
      for (const girth of [0.7, 1, 1.5]) {
        const p = computeProportions(150, preset, girth)
        for (const [key, v] of Object.entries(p)) {
          expect(v, key).toBeGreaterThan(0)
        }
      }
    }
  })

  it('girth 越大軀幹與四肢越粗，但身高不變', () => {
    const thin = computeProportions(170, 'male', 0.7)
    const thick = computeProportions(170, 'male', 1.5)
    expect(thick.torsoDepthCm).toBeGreaterThan(thin.torsoDepthCm)
    expect(thick.limbDiameterCm).toBeGreaterThan(thin.limbDiameterCm)
    expect(thick.torsoHeightCm).toBeCloseTo(thin.torsoHeightCm, 6)
  })

  it('男性肩寬大於女性，女性大於兒童（同身高比較）', () => {
    const m = computeProportions(160, 'male', 1)
    const f = computeProportions(160, 'female', 1)
    const c = computeProportions(160, 'child', 1)
    expect(m.shoulderWidthCm).toBeGreaterThan(f.shoulderWidthCm)
    expect(f.shoulderWidthCm).toBeGreaterThan(c.shoulderWidthCm)
  })

  it('兒童頭身比較大（頭佔身高比例高於成人）', () => {
    const child = computeProportions(120, 'child', 1)
    const adult = computeProportions(120, 'male', 1)
    expect(child.headHeightCm / 120).toBeGreaterThan(adult.headHeightCm / 120)
  })
})
