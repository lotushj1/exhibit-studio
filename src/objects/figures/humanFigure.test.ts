import { describe, it, expect } from 'vitest'
import { capsuleLengthCm, computeFigureLayout } from './humanFigure'
import type { BuildPreset } from './proportions'

const PRESETS: BuildPreset[] = ['male', 'female', 'child']
// 涵蓋 schema 允許的極端值：兒童拉到 200 公分、成人壓到 80 公分等
// 「體型與身高不連動」的組合，都必須是合法、不崩壞的幾何。
const HEIGHTS = [80, 90, 120, 160, 173, 195, 200]
const GIRTHS = [0.7, 1, 1.3, 1.6]

function combos(): Array<[BuildPreset, number, number]> {
  const out: Array<[BuildPreset, number, number]> = []
  for (const preset of PRESETS) {
    for (const heightCm of HEIGHTS) {
      for (const girth of GIRTHS) out.push([preset, heightCm, girth])
    }
  }
  return out
}

describe('capsuleLengthCm', () => {
  it('length 加上兩端球冠（各一個半徑）精確等於總高', () => {
    for (const [total, radius] of [
      [100, 10],
      [30, 3],
      [173, 5.2],
    ] as const) {
      expect(capsuleLengthCm(total, radius) + radius * 2).toBeCloseTo(total, 8)
    }
  })

  it('半徑超過總高一半的極端情況，length 被夾到最小正值而不是負數或零', () => {
    expect(capsuleLengthCm(5, 10)).toBeGreaterThan(0)
    expect(capsuleLengthCm(0, 10)).toBeGreaterThan(0)
  })
})

describe('computeFigureLayout：總高與腳底位置的不變量', () => {
  it('腳底精確落在 y=0，頭頂精確落在 y=heightCm，跨全部體型／身高／胖瘦組合都成立', () => {
    for (const [preset, heightCm, girth] of combos()) {
      const l = computeFigureLayout(heightCm, preset, girth)
      const feetY = l.legCenterYCm - (l.legLengthCm / 2 + l.legRadiusCm)
      const headTopY = l.headCenterYCm + l.headLengthCm / 2 + l.headRadiusCm
      expect(feetY, `preset=${preset} h=${heightCm} g=${girth}`).toBeCloseTo(0, 6)
      expect(headTopY, `preset=${preset} h=${heightCm} g=${girth}`).toBeCloseTo(heightCm, 6)
    }
  })

  it('腿頂接軀幹底、軀幹頂接頸底、頸頂接頭底：四段之間沒有斷開也沒有重疊', () => {
    for (const [preset, heightCm, girth] of combos()) {
      const l = computeFigureLayout(heightCm, preset, girth)
      const legTopY = l.legCenterYCm + l.legLengthCm / 2 + l.legRadiusCm
      const torsoBottomY = l.torsoCenterYCm - l.torsoHeightCm / 2
      const torsoTopY = l.torsoCenterYCm + l.torsoHeightCm / 2
      const neckBottomY = l.neckCenterYCm - l.neckHeightCm / 2
      const neckTopY = l.neckCenterYCm + l.neckHeightCm / 2
      const headBottomY = l.headCenterYCm - l.headLengthCm / 2 - l.headRadiusCm

      const ctx = `preset=${preset} h=${heightCm} g=${girth}`
      expect(legTopY, ctx).toBeCloseTo(torsoBottomY, 6)
      expect(torsoTopY, ctx).toBeCloseTo(neckBottomY, 6)
      expect(neckTopY, ctx).toBeCloseTo(headBottomY, 6)
    }
  })
})

describe('computeFigureLayout：部位之間不互相穿模', () => {
  it('雙腿內側邊緣不重疊（腿粗與臀寬的極端組合下仍留有間隙）', () => {
    for (const [preset, heightCm, girth] of combos()) {
      const l = computeFigureLayout(heightCm, preset, girth)
      expect(
        l.legOffsetXCm - l.legRadiusCm,
        `preset=${preset} h=${heightCm} g=${girth}`,
      ).toBeGreaterThan(0)
    }
  })

  it('手臂不會插到中心線的另一側', () => {
    for (const [preset, heightCm, girth] of combos()) {
      const l = computeFigureLayout(heightCm, preset, girth)
      expect(
        l.armOffsetXCm - l.armRadiusCm,
        `preset=${preset} h=${heightCm} g=${girth}`,
      ).toBeGreaterThan(0)
    }
  })

  it('手臂在肩膀（軀幹最寬處）的重疊量有界，不會深深插進軀幹', () => {
    for (const [preset, heightCm, girth] of combos()) {
      const l = computeFigureLayout(heightCm, preset, girth)
      const armInnerEdge = l.armOffsetXCm - l.armRadiusCm
      const overlapAtShoulder = l.torsoTopRadiusCm - armInnerEdge
      // 依 computeFigureLayout 的 armOffsetXCm 設計，肩膀處的重疊量上限
      // 是 0.15 倍的腿部半徑（見該函式內的注解），這裡驗證這個上限
      // 沒有被打破，而不是重抄一次實作公式。
      expect(
        overlapAtShoulder,
        `preset=${preset} h=${heightCm} g=${girth}`,
      ).toBeLessThan(l.legRadiusCm * 0.2)
    }
  })

  it('手臂在臀部高度（軀幹最窄處）沒有離軀幹太遠變成飄浮：間隙不超過肩寬的四成', () => {
    for (const [preset, heightCm, girth] of combos()) {
      const l = computeFigureLayout(heightCm, preset, girth)
      const armInnerEdge = l.armOffsetXCm - l.armRadiusCm
      const gapAtHip = armInnerEdge - l.torsoBottomRadiusCm
      expect(
        gapAtHip,
        `preset=${preset} h=${heightCm} g=${girth}`,
      ).toBeLessThan(l.torsoTopRadiusCm * 0.4)
    }
  })
})

describe('computeFigureLayout：極端參數下沒有負值或零', () => {
  it('所有半徑、長度、位置都是正數', () => {
    for (const [preset, heightCm, girth] of combos()) {
      const l = computeFigureLayout(heightCm, preset, girth)
      for (const [key, v] of Object.entries(l)) {
        expect(v, `preset=${preset} h=${heightCm} g=${girth} key=${key}`).toBeGreaterThan(0)
      }
    }
  })
})
