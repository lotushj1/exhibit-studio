import { describe, it, expect } from 'vitest'
import { chairLegHeightCm, chairParts, CHAIR_SEAT_THICKNESS_CM, type ChairPart } from './chair'

/** 零件的 AABB（軸對齊包圍盒），由中心點與尺寸算出上下界。 */
function aabb(p: ChairPart): { min: [number, number, number]; max: [number, number, number] } {
  const min = p.centerCm.map((c, i) => c - p.sizeCm[i] / 2) as [number, number, number]
  const max = p.centerCm.map((c, i) => c + p.sizeCm[i] / 2) as [number, number, number]
  return { min, max }
}

/** 兩個 AABB 的重疊體積；只有面／邊相接（體積為 0）視為合法，不算穿模。 */
function overlapVolume(a: ChairPart, b: ChairPart): number {
  const boxA = aabb(a)
  const boxB = aabb(b)
  let vol = 1
  for (let i = 0; i < 3; i++) {
    const lo = Math.max(boxA.min[i], boxB.min[i])
    const hi = Math.min(boxA.max[i], boxB.max[i])
    vol *= Math.max(0, hi - lo)
  }
  return vol
}

describe('chairLegHeightCm', () => {
  it('一般情況下腳高等於座面高減去座面厚度', () => {
    expect(chairLegHeightCm(45)).toBe(45 - CHAIR_SEAT_THICKNESS_CM)
  })

  it('腳高不會是負數或零（極端輸入下被夾到最小正值）', () => {
    expect(chairLegHeightCm(1)).toBeGreaterThan(0)
    expect(chairLegHeightCm(0)).toBeGreaterThan(0)
  })
})

describe('chairParts', () => {
  const cases: Array<[number, number, number, number, number]> = [
    [45, 45, 45, 40, 4], // 預設參數
    [25, 25, 25, 0, 2], // 極端最小寬深高，沒有椅背，腳最細
    [25, 25, 25, 70, 8], // 極端最小寬深高，椅背最高，腳最粗
    [90, 90, 90, 70, 8], // 極端最大寬深高，椅背最高，腳最粗
    [90, 25, 25, 0, 8], // 寬大深小，腳最粗，沒有椅背
    [25, 90, 90, 40, 2], // 深大寬小
  ]

  it('任兩個零件的重疊體積都是 0（只允許面相接，不允許穿模）', () => {
    for (const args of cases) {
      const parts = chairParts(...args)
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          expect(overlapVolume(parts[i], parts[j])).toBeCloseTo(0, 9)
        }
      }
    }
  })

  it('四腳頂面剛好接到座面底面（不重疊也不留縫）', () => {
    for (const args of cases) {
      const parts = chairParts(...args)
      const seat = parts.find((p) => p.id === 'seat')!
      const seatBottomCm = seat.centerCm[1] - seat.sizeCm[1] / 2
      for (const leg of parts.filter((p) => p.id.startsWith('leg'))) {
        const legTopCm = leg.centerCm[1] + leg.sizeCm[1] / 2
        expect(legTopCm).toBeCloseTo(seatBottomCm, 9)
      }
    }
  })

  it('座面頂面精確等於使用者輸入的座面高（介面顯示幾公分渲染就是幾公分）', () => {
    for (const [w, d, seatH, backH, legT] of cases) {
      const parts = chairParts(w, d, seatH, backH, legT)
      const seat = parts.find((p) => p.id === 'seat')!
      const seatTopCm = seat.centerCm[1] + seat.sizeCm[1] / 2
      expect(seatTopCm).toBeCloseTo(seatH, 9)
    }
  })

  it('椅背高度為 0 時不產生椅背零件', () => {
    const parts = chairParts(45, 45, 45, 0, 4)
    expect(parts.find((p) => p.id === 'back')).toBeUndefined()
    expect(parts).toHaveLength(5) // 四腳 + 座面
  })

  it('有椅背時，椅背底面剛好接到座面頂面，且總高等於座面高加椅背高', () => {
    for (const [w, d, seatH, backH, legT] of cases) {
      if (backH <= 0) continue
      const parts = chairParts(w, d, seatH, backH, legT)
      const seat = parts.find((p) => p.id === 'seat')!
      const back = parts.find((p) => p.id === 'back')!
      const seatTopCm = seat.centerCm[1] + seat.sizeCm[1] / 2
      const backBottomCm = back.centerCm[1] - back.sizeCm[1] / 2
      const backTopCm = back.centerCm[1] + back.sizeCm[1] / 2
      expect(backBottomCm).toBeCloseTo(seatTopCm, 9)
      expect(backTopCm).toBeCloseTo(seatH + backH, 9)
    }
  })

  it('椅背與後兩腳的 Z 範圍相同，但 Y 範圍不相交（不靠 XZ 巧合，靠 Y 分離避免穿模）', () => {
    for (const [w, d, seatH, backH, legT] of cases) {
      if (backH <= 0) continue
      const parts = chairParts(w, d, seatH, backH, legT)
      const back = parts.find((p) => p.id === 'back')!
      const backLegs = parts.filter((p) => p.id.includes('Back'))
      for (const leg of backLegs) {
        expect(leg.centerCm[2]).toBeCloseTo(back.centerCm[2], 9)
        const legTopCm = leg.centerCm[1] + leg.sizeCm[1] / 2
        const backBottomCm = back.centerCm[1] - back.sizeCm[1] / 2
        expect(legTopCm).toBeLessThanOrEqual(backBottomCm + 1e-9)
      }
    }
  })

  it('四腳不互相重疊（水平間距永遠大於腳的粗細）', () => {
    for (const [w, d, seatH, backH, legT] of cases) {
      const parts = chairParts(w, d, seatH, backH, legT)
      const legs = parts.filter((p) => p.id.startsWith('leg'))
      for (let i = 0; i < legs.length; i++) {
        for (let j = i + 1; j < legs.length; j++) {
          expect(overlapVolume(legs[i], legs[j])).toBeCloseTo(0, 9)
        }
      }
    }
  })

  it('每個零件的貼圖尺寸與幾何尺寸一致（避免貼圖變形）', () => {
    for (const args of cases) {
      const parts = chairParts(...args)
      for (const p of parts) {
        if (p.id === 'seat') {
          // 座面：頂/底主要可見面是寬 x 深
          expect(p.surfaceWidthCm).toBeCloseTo(p.sizeCm[0], 9)
          expect(p.surfaceHeightCm).toBeCloseTo(p.sizeCm[2], 9)
        } else {
          // 腳／椅背：正面主要可見面是寬 x 高
          expect(p.surfaceWidthCm).toBeCloseTo(p.sizeCm[0], 9)
          expect(p.surfaceHeightCm).toBeCloseTo(p.sizeCm[1], 9)
        }
      }
    }
  })
})
