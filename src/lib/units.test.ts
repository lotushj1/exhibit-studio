import { describe, it, expect } from 'vitest'
import { cmToM, mToCm, clamp, snapTo } from './units'

describe('units', () => {
  it('公分轉公尺', () => {
    expect(cmToM(100)).toBe(1)
    expect(cmToM(45)).toBeCloseTo(0.45, 10)
    expect(cmToM(0)).toBe(0)
  })

  it('公尺轉公分', () => {
    expect(mToCm(1)).toBe(100)
    expect(mToCm(0.45)).toBeCloseTo(45, 10)
  })

  it('來回轉換不失真到公分整數', () => {
    for (const cm of [1, 7, 33, 120, 999]) {
      expect(Math.round(mToCm(cmToM(cm)))).toBe(cm)
    }
  })

  it('clamp 夾在範圍內', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })

  it('snapTo 貼齊到最近的格', () => {
    expect(snapTo(0.13, 0.1)).toBeCloseTo(0.1, 10)
    expect(snapTo(0.17, 0.1)).toBeCloseTo(0.2, 10)
    expect(snapTo(-0.13, 0.1)).toBeCloseTo(-0.1, 10)
  })
})
