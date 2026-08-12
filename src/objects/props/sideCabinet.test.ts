import { describe, it, expect } from 'vitest'
import {
  sideCabinetDoorWidthCm,
  sideCabinetDoors,
  SIDE_CABINET_DOOR_GAP_CM,
} from './sideCabinet'

describe('sideCabinetDoorWidthCm', () => {
  it('一般情況下平分寬度扣掉縫隙後的剩餘', () => {
    // 80 寬、2 片門、縫隙 1：(80 - 1*3) / 2 = 38.5
    expect(sideCabinetDoorWidthCm(80, 2, 1)).toBeCloseTo(38.5, 9)
  })

  it('門片數量為 0 時回傳 0，不會除以 0', () => {
    expect(sideCabinetDoorWidthCm(80, 0, 1)).toBe(0)
  })

  it('遍歷 schema 邊界（寬 20 到 200、門片數 0 到 4），單片門寬永遠是正數', () => {
    for (let widthCm = 20; widthCm <= 200; widthCm += 10) {
      for (let doorCount = 1; doorCount <= 4; doorCount++) {
        const width = sideCabinetDoorWidthCm(widthCm, doorCount, SIDE_CABINET_DOOR_GAP_CM)
        expect(width).toBeGreaterThan(0)
      }
    }
  })

  it('最壞情況（寬最小 20、門片數最多 4）仍是正數且有餘裕', () => {
    const width = sideCabinetDoorWidthCm(20, 4, SIDE_CABINET_DOOR_GAP_CM)
    expect(width).toBeCloseTo(3.75, 9)
    expect(width).toBeGreaterThan(0)
  })
})

describe('sideCabinetDoors', () => {
  const cases: Array<[number, number, number]> = [
    [80, 75, 2], // 預設參數
    [20, 30, 4], // 極端最小寬高，門片數最多
    [200, 200, 1], // 極端最大寬高，一片門
    [20, 30, 0], // 沒有門片
  ]

  it('門片數量為 0 時不產生任何門片', () => {
    const doors = sideCabinetDoors(20, 30, 0, SIDE_CABINET_DOOR_GAP_CM)
    expect(doors).toHaveLength(0)
  })

  it('門片數量等於參數指定的數量', () => {
    for (const [w, h, count] of cases) {
      const doors = sideCabinetDoors(w, h, count, SIDE_CABINET_DOOR_GAP_CM)
      expect(doors).toHaveLength(count)
    }
  })

  it('相鄰門片之間的縫隙精確等於 gapCm（不重疊也不留多餘空隙）', () => {
    for (const [w, h, count] of cases) {
      if (count < 2) continue
      const doors = sideCabinetDoors(w, h, count, SIDE_CABINET_DOOR_GAP_CM)
      for (let i = 0; i < doors.length - 1; i++) {
        const rightEdge = doors[i].centerXCm + doors[i].widthCm / 2
        const nextLeftEdge = doors[i + 1].centerXCm - doors[i + 1].widthCm / 2
        expect(nextLeftEdge - rightEdge).toBeCloseTo(SIDE_CABINET_DOOR_GAP_CM, 9)
      }
    }
  })

  it('第一片門片左緣與最後一片門片右緣，跟箱體邊緣都恰好留 gapCm', () => {
    for (const [w, h, count] of cases) {
      if (count < 1) continue
      const doors = sideCabinetDoors(w, h, count, SIDE_CABINET_DOOR_GAP_CM)
      const first = doors[0]
      const last = doors[doors.length - 1]
      const firstLeftEdge = first.centerXCm - first.widthCm / 2
      const lastRightEdge = last.centerXCm + last.widthCm / 2
      expect(firstLeftEdge - -w / 2).toBeCloseTo(SIDE_CABINET_DOOR_GAP_CM, 9)
      expect(w / 2 - lastRightEdge).toBeCloseTo(SIDE_CABINET_DOOR_GAP_CM, 9)
    }
  })

  it('門片高度上下各留 gapCm，且是正數', () => {
    for (const [w, h, count] of cases) {
      if (count < 1) continue
      const doors = sideCabinetDoors(w, h, count, SIDE_CABINET_DOOR_GAP_CM)
      for (const d of doors) {
        expect(d.heightCm).toBeCloseTo(h - SIDE_CABINET_DOOR_GAP_CM * 2, 9)
        expect(d.heightCm).toBeGreaterThan(0)
      }
    }
  })

  it('貼圖尺寸與門片實際幾何尺寸一致', () => {
    for (const [w, h, count] of cases) {
      const doors = sideCabinetDoors(w, h, count, SIDE_CABINET_DOOR_GAP_CM)
      for (const d of doors) {
        // widthCm/heightCm 就是渲染時直接傳給 SurfaceMaterial 的值，
        // 這裡只是確認回傳的結構本身沒有另外算出不一致的數字。
        expect(d.widthCm).toBe(sideCabinetDoorWidthCm(w, count, SIDE_CABINET_DOOR_GAP_CM))
        expect(d.heightCm).toBe(Math.max(0, h - SIDE_CABINET_DOOR_GAP_CM * 2))
      }
    }
  })
})
