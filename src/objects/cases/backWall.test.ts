import { describe, it, expect } from 'vitest'
import { backWallCenterYM } from './backWall'
import { cmToM } from '../../lib/units'

describe('backWallCenterYM', () => {
  it('離地高度為 0 時中心點就是半個高度', () => {
    expect(backWallCenterYM(250, 0)).toBeCloseTo(cmToM(125), 9)
  })

  it('離地高度為 lift 時，底面剛好落在 lift（不會沉到地下）', () => {
    const cases: Array<[number, number]> = [
      [250, 0],
      [250, 50],
      [50, 200], // schema 極端：最矮背板 + 最大離地高度
      [500, 0], // schema 極端：最高背板
    ]
    for (const [heightCm, liftCm] of cases) {
      const centerY = backWallCenterYM(heightCm, liftCm)
      const bottomY = centerY - cmToM(heightCm) / 2
      expect(bottomY).toBeCloseTo(cmToM(liftCm), 9)
      expect(bottomY).toBeGreaterThanOrEqual(-1e-9)
    }
  })

  it('總高不會因為離地高度而改變：頂面減底面永遠等於 heightCm', () => {
    const centerY = backWallCenterYM(250, 80)
    const topY = centerY + cmToM(250) / 2
    const bottomY = centerY - cmToM(250) / 2
    expect(topY - bottomY).toBeCloseTo(cmToM(250), 9)
  })

  it('即使傳入負的離地高度也不會讓底面沉到地下（防禦性夾制）', () => {
    const centerY = backWallCenterYM(250, -50)
    const bottomY = centerY - cmToM(250) / 2
    expect(bottomY).toBeGreaterThanOrEqual(-1e-9)
  })
})
