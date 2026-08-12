import { describe, it, expect } from 'vitest'
import { buildDimensions } from './dimensionMath'

describe('buildDimensions', () => {
  const size: [number, number, number] = [1.2, 0.9, 0.45]
  const center: [number, number, number] = [0, 0.45, 0]

  it('產生三條線，分別對應 X、Y、Z', () => {
    const lines = buildDimensions(size, center)
    expect(lines).toHaveLength(3)
    expect(lines.map((l) => l.axis)).toEqual(['x', 'y', 'z'])
  })

  it('標註數值是四捨五入到整數的公分', () => {
    const lines = buildDimensions(size, center)
    expect(lines[0].labelCm).toBe(120)
    expect(lines[1].labelCm).toBe(90)
    expect(lines[2].labelCm).toBe(45)
  })

  it('每條線的長度等於該軸的尺寸', () => {
    const lines = buildDimensions(size, center)
    const length = (l: (typeof lines)[number]) =>
      Math.hypot(l.to[0] - l.from[0], l.to[1] - l.from[1], l.to[2] - l.from[2])
    expect(length(lines[0])).toBeCloseTo(1.2, 6)
    expect(length(lines[1])).toBeCloseTo(0.9, 6)
    expect(length(lines[2])).toBeCloseTo(0.45, 6)
  })

  it('標籤位置在線段中點', () => {
    for (const l of buildDimensions(size, center)) {
      for (let i = 0; i < 3; i++) {
        expect(l.labelPos[i]).toBeCloseTo((l.from[i] + l.to[i]) / 2, 6)
      }
    }
  })

  it('中心位移時三條線跟著位移', () => {
    const moved = buildDimensions(size, [2, 0.45, -1])
    const base = buildDimensions(size, center)
    expect(moved[0].from[0] - base[0].from[0]).toBeCloseTo(2, 6)
    expect(moved[0].from[2] - base[0].from[2]).toBeCloseTo(-1, 6)
  })

  it('零尺寸不產生 NaN', () => {
    for (const l of buildDimensions([0, 0, 0], [0, 0, 0])) {
      for (const n of [...l.from, ...l.to, ...l.labelPos]) {
        expect(Number.isFinite(n)).toBe(true)
      }
      expect(l.labelCm).toBe(0)
    }
  })
})
