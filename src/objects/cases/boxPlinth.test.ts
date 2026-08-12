import { describe, it, expect } from 'vitest'
import { plinthHeights, plinthKickInset } from './boxPlinth'

describe('plinthHeights', () => {
  it('一般情況下本體高等於總高減踢腳高', () => {
    expect(plinthHeights(90, 8)).toEqual({ bodyHeightCm: 82, kickHeightCm: 8 })
  })

  it('本體高與踢腳高相加永遠等於使用者輸入的總高（即使踢腳高度超出可用範圍）', () => {
    const cases: Array<[number, number]> = [
      [90, 8],
      [10, 40],
      [300, 40],
      [10, 0],
      [15, 40],
    ]
    for (const [heightCm, kickHeightCm] of cases) {
      const { bodyHeightCm, kickHeightCm: kick } = plinthHeights(heightCm, kickHeightCm)
      expect(bodyHeightCm + kick).toBe(heightCm)
    }
  })

  it('踢腳高度過大時會被夾住，本體至少保留 1 公分', () => {
    const { bodyHeightCm, kickHeightCm } = plinthHeights(10, 40)
    expect(bodyHeightCm).toBeGreaterThanOrEqual(1)
    expect(kickHeightCm).toBe(9)
  })

  it('沒有踢腳時本體高就是總高', () => {
    expect(plinthHeights(90, 0)).toEqual({ bodyHeightCm: 90, kickHeightCm: 0 })
  })
})

describe('plinthKickInset', () => {
  it('一般情況下直接採用使用者輸入的內縮值', () => {
    expect(plinthKickInset(120, 60, 3)).toBe(3)
  })

  it('寬或深接近最小值時內縮會被夾住，避免踢腳退化成細柱', () => {
    const inset = plinthKickInset(10, 10, 20)
    const footprint = 10 - inset * 2
    expect(footprint).toBeGreaterThanOrEqual(4)
  })

  it('內縮值不會是負數', () => {
    expect(plinthKickInset(10, 10, -5)).toBeGreaterThanOrEqual(0)
  })
})
