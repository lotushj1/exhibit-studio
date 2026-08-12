import { describe, it, expect } from 'vitest'
import { applyDrag, SNAP_STEP_M } from './dragMath'

describe('applyDrag', () => {
  it('未按 Shift 時直接加上位移', () => {
    expect(applyDrag([1, 0, 2], [0.13, -0.07], false)).toEqual([1.13, 0, 1.93])
  })

  it('Y 座標永遠不變', () => {
    expect(applyDrag([0, 0.5, 0], [1, 1], false)[1]).toBe(0.5)
    expect(applyDrag([0, 0.5, 0], [1, 1], true)[1]).toBe(0.5)
  })

  it('按 Shift 時貼齊 10 公分網格', () => {
    const r = applyDrag([0, 0, 0], [0.13, 0.17], true)
    expect(r[0]).toBeCloseTo(0.1, 6)
    expect(r[2]).toBeCloseTo(0.2, 6)
  })

  it('貼齊步距是 10 公分', () => {
    expect(SNAP_STEP_M).toBeCloseTo(0.1, 10)
  })

  it('貼齊在負座標一樣正確', () => {
    const r = applyDrag([0, 0, 0], [-0.13, -0.17], true)
    expect(r[0]).toBeCloseTo(-0.1, 6)
    expect(r[2]).toBeCloseTo(-0.2, 6)
  })

  it('非有限的位移不改變原位置', () => {
    expect(applyDrag([1, 0, 2], [NaN, 0], false)).toEqual([1, 0, 2])
    expect(applyDrag([1, 0, 2], [0, Infinity], false)).toEqual([1, 0, 2])
  })
})
