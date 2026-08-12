import { describe, it, expect } from 'vitest'
import { glassShelfZone, glassCasePanels, type GlassPanelSpec } from './glassCase'
import { shelfPositionsM } from '../shared/geometry'

/** 面板的 AABB（軸對齊包圍盒），由中心點與尺寸算出上下界。 */
function aabb(p: GlassPanelSpec): { min: [number, number, number]; max: [number, number, number] } {
  const min = p.centerCm.map((c, i) => c - p.sizeCm[i] / 2) as [number, number, number]
  const max = p.centerCm.map((c, i) => c + p.sizeCm[i] / 2) as [number, number, number]
  return { min, max }
}

/** 兩個 AABB 的重疊體積；只有面／邊相接（體積為 0）視為合法，不算穿模。 */
function overlapVolume(a: GlassPanelSpec, b: GlassPanelSpec): number {
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

describe('glassShelfZone', () => {
  it('淨高扣掉頂蓋厚度與層板厚度', () => {
    expect(glassShelfZone(70, 0.6, 1.5)).toEqual({ innerHeightCm: 67.9, baseOffsetCm: 0.75 })
  })

  it('底部位移永遠是層板厚度的一半', () => {
    expect(glassShelfZone(70, 0.6, 3).baseOffsetCm).toBe(1.5)
  })

  it('淨高不會是負數（極端厚度組合下夾在 0）', () => {
    const { innerHeightCm } = glassShelfZone(10, 3, 8)
    expect(innerHeightCm).toBeGreaterThanOrEqual(0)
  })

  it('最上層層板頂面不會超過頂蓋內側（不穿模）', () => {
    const cases: Array<[number, number, number, number]> = [
      [70, 0.6, 1, 1.5], // 一般情況
      [10, 3, 6, 6], // 極端：玻璃罩很矮、玻璃很厚、層板數多又厚
      [200, 3, 6, 6], // 極端：玻璃罩很高
    ]
    for (const [glassH, glassT, shelfCount, shelfT] of cases) {
      const baseH = 90
      const { innerHeightCm, baseOffsetCm } = glassShelfZone(glassH, glassT, shelfT)
      const ys = shelfPositionsM(innerHeightCm, shelfCount, baseH + baseOffsetCm)
      const innerTopCm = baseH + glassH - glassT
      for (const yM of ys) {
        const shelfTopCm = yM * 100 + shelfT / 2
        expect(shelfTopCm).toBeLessThanOrEqual(innerTopCm + 1e-9)
      }
    }
  })

  it('最下層層板底面不會低於底櫃頂面（不陷入底櫃）', () => {
    const cases: Array<[number, number, number, number]> = [
      [70, 0.6, 1, 1.5],
      [10, 3, 6, 6],
      [200, 3, 6, 6],
    ]
    for (const [glassH, glassT, shelfCount, shelfT] of cases) {
      const baseH = 90
      const { innerHeightCm, baseOffsetCm } = glassShelfZone(glassH, glassT, shelfT)
      const ys = shelfPositionsM(innerHeightCm, shelfCount, baseH + baseOffsetCm)
      for (const yM of ys) {
        const shelfBottomCm = yM * 100 - shelfT / 2
        expect(shelfBottomCm).toBeGreaterThanOrEqual(baseH - 1e-9)
      }
    }
  })
})

describe('glassCasePanels', () => {
  const cases: Array<[number, number, number, number, number]> = [
    [80, 50, 90, 70, 0.6], // 預設參數；review 指出這組原本就會穿模
    [20, 20, 10, 10, 0.3], // 極端：寬深高都最小、玻璃最薄
    [300, 200, 200, 200, 3], // 極端：寬深高都最大、玻璃最厚
    [20, 200, 10, 200, 3], // 極端：窄而深，玻璃很厚
  ]

  it('任兩片玻璃板的重疊體積都是 0（只允許面／邊相接，不允許穿模）', () => {
    for (const [w, d, baseH, glassH, glassT] of cases) {
      const panels = glassCasePanels(w, d, baseH, glassH, glassT)
      for (let i = 0; i < panels.length; i++) {
        for (let j = i + 1; j < panels.length; j++) {
          const vol = overlapVolume(panels[i], panels[j])
          expect(vol).toBeCloseTo(0, 9)
        }
      }
    }
  })

  it('四面牆頂端剛好接到頂蓋底面（不重疊也不留縫）', () => {
    for (const [w, d, baseH, glassH, glassT] of cases) {
      const panels = glassCasePanels(w, d, baseH, glassH, glassT)
      const top = panels.find((p) => p.id === 'top')!
      const capBottomCm = top.centerCm[1] - top.sizeCm[1] / 2
      for (const wall of panels.filter((p) => p.id !== 'top')) {
        const wallTopCm = wall.centerCm[1] + wall.sizeCm[1] / 2
        expect(wallTopCm).toBeCloseTo(capBottomCm, 9)
      }
    }
  })

  it('整體外緣總高仍是 glassHeightCm，底部仍在底櫃頂面（高度契約不變）', () => {
    for (const [w, d, baseH, glassH, glassT] of cases) {
      const panels = glassCasePanels(w, d, baseH, glassH, glassT)
      const top = panels.find((p) => p.id === 'top')!
      const outerTopCm = top.centerCm[1] + top.sizeCm[1] / 2
      const outerBottomCm = Math.min(
        ...panels.filter((p) => p.id !== 'top').map((p) => p.centerCm[1] - p.sizeCm[1] / 2),
      )
      expect(outerTopCm).toBeCloseTo(baseH + glassH, 9)
      expect(outerBottomCm).toBeCloseTo(baseH, 9)
    }
  })

  it('左右牆的深度是內側淨深，只頂到前後牆內側面，不會穿出前後牆', () => {
    for (const [w, d, baseH, glassH, glassT] of cases) {
      const panels = glassCasePanels(w, d, baseH, glassH, glassT)
      const front = panels.find((p) => p.id === 'front')!
      const back = panels.find((p) => p.id === 'back')!
      const frontInnerZ = front.centerCm[2] - front.sizeCm[2] / 2
      const backInnerZ = back.centerCm[2] + back.sizeCm[2] / 2
      for (const side of [panels.find((p) => p.id === 'left')!, panels.find((p) => p.id === 'right')!]) {
        const sideMaxZ = side.centerCm[2] + side.sizeCm[2] / 2
        const sideMinZ = side.centerCm[2] - side.sizeCm[2] / 2
        expect(sideMaxZ).toBeCloseTo(frontInnerZ, 9)
        expect(sideMinZ).toBeCloseTo(backInnerZ, 9)
      }
    }
  })

  it('每片板的貼圖尺寸與幾何尺寸一致（避免貼圖變形）', () => {
    for (const [w, d, baseH, glassH, glassT] of cases) {
      const panels = glassCasePanels(w, d, baseH, glassH, glassT)
      const byId = Object.fromEntries(panels.map((p) => [p.id, p]))
      expect(byId.front.surfaceWidthCm).toBe(w)
      expect(byId.front.surfaceHeightCm).toBe(byId.front.sizeCm[1])
      expect(byId.left.surfaceWidthCm).toBe(byId.left.sizeCm[2])
      expect(byId.left.surfaceHeightCm).toBe(byId.left.sizeCm[1])
      expect(byId.top.surfaceWidthCm).toBe(w)
      expect(byId.top.surfaceHeightCm).toBe(d)
    }
  })
})
