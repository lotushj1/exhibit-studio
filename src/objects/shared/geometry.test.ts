import { describe, it, expect } from 'vitest'
import { boxSizeM, surfaceSizeCm, shelfPositionsM } from './geometry'

describe('boxSizeM', () => {
  it('公分轉公尺且順序為寬高深', () => {
    expect(boxSizeM(120, 90, 45)).toEqual([1.2, 0.9, 0.45])
  })
})

describe('surfaceSizeCm', () => {
  const w = 120, h = 90, d = 45

  it('正面與背面是寬乘高', () => {
    expect(surfaceSizeCm('front', w, h, d)).toEqual({ widthCm: 120, heightCm: 90 })
    expect(surfaceSizeCm('back', w, h, d)).toEqual({ widthCm: 120, heightCm: 90 })
  })

  it('左右面是深乘高', () => {
    expect(surfaceSizeCm('left', w, h, d)).toEqual({ widthCm: 45, heightCm: 90 })
    expect(surfaceSizeCm('right', w, h, d)).toEqual({ widthCm: 45, heightCm: 90 })
  })

  it('頂面與底面是寬乘深', () => {
    expect(surfaceSizeCm('top', w, h, d)).toEqual({ widthCm: 120, heightCm: 45 })
    expect(surfaceSizeCm('bottom', w, h, d)).toEqual({ widthCm: 120, heightCm: 45 })
  })
})

describe('shelfPositionsM', () => {
  it('層板數為 0 時回傳空陣列', () => {
    expect(shelfPositionsM(100, 0, 0)).toEqual([])
  })

  it('層板在可用高度內等距分布，不貼齊上下端', () => {
    const ys = shelfPositionsM(100, 3, 0)
    expect(ys).toHaveLength(3)
    expect(ys[0]).toBeCloseTo(0.25, 6)
    expect(ys[1]).toBeCloseTo(0.5, 6)
    expect(ys[2]).toBeCloseTo(0.75, 6)
  })

  it('baseY 位移套用到每一層', () => {
    const ys = shelfPositionsM(100, 1, 60)
    expect(ys[0]).toBeCloseTo(1.1, 6)   // 0.6 + 0.5
  })

  it('層板由下往上排序', () => {
    const ys = shelfPositionsM(200, 4, 0)
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1])
  })
})
