import { describe, it, expect } from 'vitest'
import {
  stoolLegHeightCm,
  stoolLegOrbitRadiusCm,
  stoolParts,
  STOOL_SEAT_THICKNESS_CM,
} from './stool'

describe('stoolLegHeightCm', () => {
  it('一般情況下腳高等於總高減去座面厚度', () => {
    expect(stoolLegHeightCm(45)).toBe(45 - STOOL_SEAT_THICKNESS_CM)
  })

  it('腳高不會是負數或零（極端輸入下被夾到最小正值）', () => {
    expect(stoolLegHeightCm(1)).toBeGreaterThan(0)
    expect(stoolLegHeightCm(0)).toBeGreaterThan(0)
  })
})

describe('stoolLegOrbitRadiusCm', () => {
  it('一般情況下就是座面半徑的 0.7 倍', () => {
    expect(stoolLegOrbitRadiusCm(34, 3)).toBeCloseTo(17 * 0.7, 9)
  })

  it('直徑最小、腳最粗的極端組合下，腳的外緣不會超出座面邊緣（原本會超出約 1 公分）', () => {
    const orbit = stoolLegOrbitRadiusCm(20, 8)
    const legRadius = 8 / 2
    const seatRadius = 20 / 2
    expect(orbit + legRadius).toBeLessThanOrEqual(seatRadius + 1e-9)
  })

  it('遍歷 schema 邊界，腳的外緣永遠不超出座面邊緣', () => {
    for (let dia = 20; dia <= 60; dia += 5) {
      for (const legT of [2, 2.5, 3, 4, 5, 6, 7, 8]) {
        const orbit = stoolLegOrbitRadiusCm(dia, legT)
        expect(orbit + legT / 2).toBeLessThanOrEqual(dia / 2 + 1e-9)
      }
    }
  })
})

describe('stoolParts', () => {
  const cases: Array<[number, number, number]> = [
    [34, 45, 3], // 預設參數
    [20, 25, 2], // 極端最小直徑與高，腳最細
    [20, 90, 8], // 極端最小直徑，腳最粗
    [60, 25, 8], // 極端最大直徑，高最小，腳最粗
    [60, 90, 2], // 極端最大直徑與高
  ]

  it('腳頂面剛好接到座面底面（不重疊也不留縫）', () => {
    for (const [dia, h, legT] of cases) {
      const parts = stoolParts(dia, h, legT)
      const seat = parts.find((p) => p.id === 'seat')!
      const seatBottomCm = seat.centerCm[1] - seat.heightCm / 2
      for (const leg of parts.filter((p) => p.id.startsWith('leg'))) {
        const legTopCm = leg.centerCm[1] + leg.heightCm / 2
        expect(legTopCm).toBeCloseTo(seatBottomCm, 9)
      }
    }
  })

  it('座面頂面精確等於使用者輸入的總高（介面顯示幾公分渲染就是幾公分）', () => {
    for (const [dia, h, legT] of cases) {
      const parts = stoolParts(dia, h, legT)
      const seat = parts.find((p) => p.id === 'seat')!
      const seatTopCm = seat.centerCm[1] + seat.heightCm / 2
      expect(seatTopCm).toBeCloseTo(h, 9)
    }
  })

  it('腳底落在 Y=0（站在地面上）', () => {
    for (const [dia, h, legT] of cases) {
      const parts = stoolParts(dia, h, legT)
      for (const leg of parts.filter((p) => p.id.startsWith('leg'))) {
        const legBottomCm = leg.centerCm[1] - leg.heightCm / 2
        expect(legBottomCm).toBeCloseTo(0, 9)
      }
    }
  })

  it('三隻腳互相不重疊：水平間距永遠大於等於兩腳半徑之和', () => {
    for (const [dia, h, legT] of cases) {
      const parts = stoolParts(dia, h, legT)
      const legs = parts.filter((p) => p.id.startsWith('leg'))
      for (let i = 0; i < legs.length; i++) {
        for (let j = i + 1; j < legs.length; j++) {
          const a = legs[i]
          const b = legs[j]
          const dx = a.centerCm[0] - b.centerCm[0]
          const dz = a.centerCm[2] - b.centerCm[2]
          const dist = Math.sqrt(dx * dx + dz * dz)
          expect(dist).toBeGreaterThanOrEqual(a.radiusCm + b.radiusCm - 1e-9)
        }
      }
    }
  })

  it('三隻腳的外緣都不超出座面邊緣', () => {
    for (const [dia, h, legT] of cases) {
      const parts = stoolParts(dia, h, legT)
      const seat = parts.find((p) => p.id === 'seat')!
      for (const leg of parts.filter((p) => p.id.startsWith('leg'))) {
        const centerDist = Math.sqrt(leg.centerCm[0] ** 2 + leg.centerCm[2] ** 2)
        expect(centerDist + leg.radiusCm).toBeLessThanOrEqual(seat.radiusCm + 1e-9)
      }
    }
  })

  it('每個零件的貼圖尺寸用直徑，不是半徑', () => {
    for (const [dia, h, legT] of cases) {
      const parts = stoolParts(dia, h, legT)
      for (const p of parts) {
        expect(p.surfaceWidthCm).toBeCloseTo(p.radiusCm * 2, 9)
      }
      const seat = parts.find((p) => p.id === 'seat')!
      expect(seat.surfaceWidthCm).toBeCloseTo(dia, 9)
      expect(seat.surfaceHeightCm).toBeCloseTo(dia, 9)
      for (const leg of parts.filter((p) => p.id.startsWith('leg'))) {
        expect(leg.surfaceWidthCm).toBeCloseTo(legT, 9)
        expect(leg.surfaceHeightCm).toBeCloseTo(leg.heightCm, 9)
      }
    }
  })
})
