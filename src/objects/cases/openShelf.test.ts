import { describe, it, expect } from 'vitest'
import {
  openShelfCapZone,
  openShelfSideThicknessCm,
  openShelfBackZone,
  openShelfFitShelfCount,
  openShelfPanels,
  type OpenShelfPanelSpec,
} from './openShelf'

/** 零件的 AABB（軸對齊包圍盒），由中心點與尺寸算出上下界。 */
function aabb(p: OpenShelfPanelSpec): { min: [number, number, number]; max: [number, number, number] } {
  const min = p.centerCm.map((c, i) => c - p.sizeCm[i] / 2) as [number, number, number]
  const max = p.centerCm.map((c, i) => c + p.sizeCm[i] / 2) as [number, number, number]
  return { min, max }
}

/** 兩個 AABB 的重疊體積；只有面／邊相接（體積為 0）視為合法，不算穿模。 */
function overlapVolume(a: OpenShelfPanelSpec, b: OpenShelfPanelSpec): number {
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

describe('openShelfCapZone', () => {
  it('一般情況下蓋板厚度就是層板厚度', () => {
    expect(openShelfCapZone(180, 2.5)).toEqual({ capThicknessCm: 2.5, innerHeightCm: 175 })
  })

  it('淨高不會是負數（超出 schema 的極端厚度組合下夾在 0）', () => {
    const { innerHeightCm } = openShelfCapZone(10, 20)
    expect(innerHeightCm).toBeGreaterThanOrEqual(0)
  })

  it('兩片蓋板厚度相加永遠不超過總高', () => {
    const cases: Array<[number, number]> = [
      [180, 2.5],
      [60, 4], // schema 極端：最矮總高 + 最厚層板
      [10, 20], // 超出 schema 的極端：厚度遠超過總高
    ]
    for (const [heightCm, shelfThicknessCm] of cases) {
      const { capThicknessCm } = openShelfCapZone(heightCm, shelfThicknessCm)
      expect(capThicknessCm * 2).toBeLessThanOrEqual(heightCm + 1e-9)
    }
  })

  it('在 schema 範圍內，夾制完全不會觸發：蓋板厚度就等於層板厚度本身', () => {
    for (let heightCm = 60; heightCm <= 300; heightCm += 10) {
      for (const shelfThicknessCm of [1, 1.5, 2, 2.5, 3, 3.5, 4]) {
        const { capThicknessCm } = openShelfCapZone(heightCm, shelfThicknessCm)
        expect(capThicknessCm).toBe(shelfThicknessCm)
      }
    }
  })
})

describe('openShelfSideThicknessCm', () => {
  it('一般情況下就是使用者輸入的側板厚度', () => {
    expect(openShelfSideThicknessCm(100, 2.5)).toBe(2.5)
  })

  it('兩片側板厚度相加永遠不超過總寬', () => {
    const cases: Array<[number, number]> = [
      [100, 2.5],
      [30, 4], // schema 極端：最窄總寬 + 最厚側板
      [10, 20], // 超出 schema 的極端：厚度遠超過總寬
    ]
    for (const [widthCm, sideThicknessCm] of cases) {
      const sideT = openShelfSideThicknessCm(widthCm, sideThicknessCm)
      expect(sideT * 2).toBeLessThanOrEqual(widthCm + 1e-9)
    }
  })

  it('在 schema 範圍內，夾制完全不會觸發：側板厚度就等於輸入值本身', () => {
    for (let widthCm = 30; widthCm <= 400; widthCm += 10) {
      for (const sideThicknessCm of [1, 1.5, 2, 2.5, 3, 3.5, 4]) {
        expect(openShelfSideThicknessCm(widthCm, sideThicknessCm)).toBe(sideThicknessCm)
      }
    }
  })
})

describe('openShelfBackZone', () => {
  it('沒有背板時層板用滿整個深度、置中在 Z=0', () => {
    expect(openShelfBackZone(35, 2.5, false)).toEqual({
      backThicknessCm: 0,
      shelfDepthCm: 35,
      shelfZCenterCm: 0,
    })
  })

  it('一般情況下背板厚度就是輸入的側板厚度，層板深度內縮同樣的量', () => {
    expect(openShelfBackZone(35, 2.5, true)).toEqual({
      backThicknessCm: 2.5,
      shelfDepthCm: 32.5,
      shelfZCenterCm: 1.25,
    })
  })

  it('層板深度不會是負數（超出 schema 的極端：背板厚度超過總深）', () => {
    const { shelfDepthCm } = openShelfBackZone(10, 20, true)
    expect(shelfDepthCm).toBeGreaterThanOrEqual(0)
  })

  it('在 schema 範圍內，夾制完全不會觸發：depthCm 最小 15 永遠大於 sideThicknessCm 最大 4', () => {
    for (let depthCm = 15; depthCm <= 120; depthCm += 5) {
      for (const sideThicknessCm of [1, 1.5, 2, 2.5, 3, 3.5, 4]) {
        const { backThicknessCm, shelfDepthCm } = openShelfBackZone(depthCm, sideThicknessCm, true)
        expect(backThicknessCm).toBe(sideThicknessCm)
        expect(shelfDepthCm).toBeCloseTo(depthCm - sideThicknessCm, 9)
      }
    }
  })
})

describe('openShelfFitShelfCount', () => {
  it('一般情況下就是使用者輸入的層板數量', () => {
    expect(openShelfFitShelfCount(175, 2.5, 4)).toBe(4)
  })

  it('數量不會是負數', () => {
    expect(openShelfFitShelfCount(175, 2.5, -5)).toBe(0)
  })

  it('超出 schema 的極端組合下（間距塞不下任何一片層板）實際渲染數量會被夾少：函式本身仍是安全的防禦性程式碼', () => {
    // 這組數值已經超出新版 schema（heightCm 最小 60、shelfThicknessCm 最大 4），
    // 純粹用來證明函式本身在不合法輸入下也不會讓層板穿模，而不是宣稱這個情況
    // 會在介面上發生。schema 範圍內的完整證明見下面「不可能區域已消失」。
    const { innerHeightCm } = openShelfCapZone(30, 8)
    const count = openShelfFitShelfCount(innerHeightCm, 8, 10)
    expect(count).toBeLessThan(10)
  })

  it('夾過後的數量搭配層板厚度，相鄰層板間距永遠不小於層板厚度', () => {
    const cases: Array<[number, number, number]> = [
      [175, 2.5, 4],
      [14, 8, 10], // 超出 schema：極端厚又極端多
      [175, 1, 10],
      [0, 5, 5], // 淨高為 0
    ]
    for (const [innerHeightCm, shelfThicknessCm, requestedCount] of cases) {
      const count = openShelfFitShelfCount(innerHeightCm, shelfThicknessCm, requestedCount)
      if (count > 0) {
        const gap = innerHeightCm / (count + 1)
        expect(gap).toBeGreaterThanOrEqual(shelfThicknessCm - 1e-9)
      }
    }
  })
})

describe('層板數量在 schema 邊界下永遠不會被夾少（不可能區域已消失的證明）', () => {
  // Task 10 review 指出：舊版 schema（heightCm 最小 30、shelfThicknessCm 最大 8）
  // 允許使用者調出「內部可用高度容不下任何一片層板」的合法組合，導致
  // shelfCount 顯示 10 但畫面上實際渲染 0 片。修法是把不可能的參數組合
  // 從 schema 邊界上根除，而不是加提示遮掩。這裡遍歷新版 schema 的完整
  // 邊界組合，證明 openShelfFitShelfCount 在任何合法輸入下都不會把
  // 使用者請求的數量夾少，也就是「防禦性夾制」在合法範圍內永遠不觸發。
  it('遍歷 heightCm、shelfThicknessCm、shelfCount 的完整 schema 範圍，fitCount 永遠等於請求的 shelfCount', () => {
    const shelfThicknesses = [1, 1.5, 2, 2.5, 3, 3.5, 4]
    for (let heightCm = 60; heightCm <= 300; heightCm++) {
      for (const shelfThicknessCm of shelfThicknesses) {
        const { innerHeightCm } = openShelfCapZone(heightCm, shelfThicknessCm)
        for (let shelfCount = 0; shelfCount <= 10; shelfCount++) {
          const fitCount = openShelfFitShelfCount(innerHeightCm, shelfThicknessCm, shelfCount)
          expect(fitCount).toBe(shelfCount)
        }
      }
    }
  })

  it('最壞情況（heightCm 最小 60、shelfThicknessCm 最大 4、shelfCount 最多 10）仍有安全餘裕', () => {
    const { innerHeightCm } = openShelfCapZone(60, 4)
    expect(innerHeightCm).toBe(52)
    const fitCount = openShelfFitShelfCount(innerHeightCm, 4, 10)
    expect(fitCount).toBe(10)
    // 間距 52/11 ≈ 4.73，比層板厚度 4 還大，留有餘裕，不是貼著臨界值。
    const gap = innerHeightCm / (10 + 1)
    expect(gap).toBeGreaterThan(4)
  })
})

describe('openShelfPanels', () => {
  const cases: Array<[number, number, number, number, number, number, boolean]> = [
    [100, 35, 180, 4, 2.5, 2.5, true], // 預設參數
    [100, 35, 180, 4, 2.5, 2.5, false], // 預設參數但沒有背板
    [30, 15, 60, 10, 4, 4, true], // schema 全極端：最小寬深高、最厚層板側板、最多層板數
    [30, 15, 60, 10, 4, 4, false], // 同上但沒有背板
    [400, 120, 300, 10, 4, 4, true], // schema 全極端：最大寬深高
    [30, 120, 60, 0, 1, 1, true], // 窄而深、無層板
  ]

  it('任兩個零件的重疊體積都是 0（只允許面／邊相接，不允許穿模）', () => {
    for (const args of cases) {
      const panels = openShelfPanels(...args)
      for (let i = 0; i < panels.length; i++) {
        for (let j = i + 1; j < panels.length; j++) {
          const vol = overlapVolume(panels[i], panels[j])
          expect(vol).toBeCloseTo(0, 9)
        }
      }
    }
  })

  it('schema 全極端組合下，10 片層板確實全數渲染（不再被夾少）', () => {
    const panels = openShelfPanels(30, 15, 60, 10, 4, 4, true)
    expect(panels.filter((p) => p.id.startsWith('shelf-'))).toHaveLength(10)
  })

  it('左右側板貫穿全高，總高永遠等於 heightCm（不多也不少）', () => {
    for (const [w, d, h, shelfCount, shelfT, sideT, hasBack] of cases) {
      const panels = openShelfPanels(w, d, h, shelfCount, shelfT, sideT, hasBack)
      for (const side of panels.filter((p) => p.id === 'sideLeft' || p.id === 'sideRight')) {
        const topCm = side.centerCm[1] + side.sizeCm[1] / 2
        const bottomCm = side.centerCm[1] - side.sizeCm[1] / 2
        expect(topCm).toBeCloseTo(h, 9)
        expect(bottomCm).toBeCloseTo(0, 9)
      }
    }
  })

  it('頂底蓋板內縮側板厚度後嵌在兩片側板之間，外緣寬度仍是 widthCm', () => {
    for (const [w, d, h, shelfCount, shelfT, sideT, hasBack] of cases) {
      const panels = openShelfPanels(w, d, h, shelfCount, shelfT, sideT, hasBack)
      const left = panels.find((p) => p.id === 'sideLeft')!
      const right = panels.find((p) => p.id === 'sideRight')!
      const cap = panels.find((p) => p.id === 'capBottom')!
      const leftInnerX = left.centerCm[0] + left.sizeCm[0] / 2
      const rightInnerX = right.centerCm[0] - right.sizeCm[0] / 2
      expect(cap.centerCm[0] - cap.sizeCm[0] / 2).toBeCloseTo(leftInnerX, 9)
      expect(cap.centerCm[0] + cap.sizeCm[0] / 2).toBeCloseTo(rightInnerX, 9)
      const outerLeftX = left.centerCm[0] - left.sizeCm[0] / 2
      const outerRightX = right.centerCm[0] + right.sizeCm[0] / 2
      expect(outerRightX - outerLeftX).toBeCloseTo(w, 9)
    }
  })

  it('有背板時中間層板深度內縮，止於背板前緣，不會插進背板', () => {
    for (const [w, d, h, shelfCount, shelfT, sideT] of cases) {
      const panels = openShelfPanels(w, d, h, shelfCount, shelfT, sideT, true)
      const back = panels.find((p) => p.id === 'back')
      if (!back) continue
      const backFrontZ = back.centerCm[2] + back.sizeCm[2] / 2
      for (const shelf of panels.filter((p) => p.id.startsWith('shelf-'))) {
        const shelfBackZ = shelf.centerCm[2] - shelf.sizeCm[2] / 2
        expect(shelfBackZ).toBeCloseTo(backFrontZ, 9)
      }
    }
  })

  it('沒有背板時中間層板用滿整個深度', () => {
    const panels = openShelfPanels(100, 35, 180, 4, 2.5, 2.5, false)
    expect(panels.find((p) => p.id === 'back')).toBeUndefined()
    for (const shelf of panels.filter((p) => p.id.startsWith('shelf-'))) {
      expect(shelf.sizeCm[2]).toBeCloseTo(35, 9)
      expect(shelf.centerCm[2]).toBeCloseTo(0, 9)
    }
  })

  it('每個零件的貼圖尺寸與幾何尺寸一致（避免貼圖變形）', () => {
    for (const args of cases) {
      const panels = openShelfPanels(...args)
      for (const p of panels) {
        if (p.id === 'sideLeft' || p.id === 'sideRight') {
          // 側板：深 x 高
          expect(p.surfaceWidthCm).toBeCloseTo(p.sizeCm[2], 9)
          expect(p.surfaceHeightCm).toBeCloseTo(p.sizeCm[1], 9)
        } else if (p.id === 'back') {
          // 背板：實際內縮後的寬 x 高
          expect(p.surfaceWidthCm).toBeCloseTo(p.sizeCm[0], 9)
          expect(p.surfaceHeightCm).toBeCloseTo(p.sizeCm[1], 9)
        } else {
          // 蓋板／層板：實際寬 x 深
          expect(p.surfaceWidthCm).toBeCloseTo(p.sizeCm[0], 9)
          expect(p.surfaceHeightCm).toBeCloseTo(p.sizeCm[2], 9)
        }
      }
    }
  })

  it('層板數量為 0 時不會產生任何 shelf 零件', () => {
    const panels = openShelfPanels(100, 35, 180, 0, 2.5, 2.5, true)
    expect(panels.filter((p) => p.id.startsWith('shelf-'))).toHaveLength(0)
  })
})
