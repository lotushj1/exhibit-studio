import { describe, it, expect } from 'vitest'
import { BOX_FACE_ORDER, BOX_SURFACES } from './TexturedBox'
import { surfaceSizeCm } from './geometry'

describe('BOX_FACE_ORDER', () => {
  it('順序符合 Three.js BoxGeometry 的材質索引', () => {
    // BoxGeometry 材質順序固定為 +X, -X, +Y, -Y, +Z, -Z
    expect(BOX_FACE_ORDER).toEqual(['right', 'left', 'top', 'bottom', 'front', 'back'])
  })

  it('六個面剛好對應六個 surface 定義', () => {
    expect(BOX_FACE_ORDER).toHaveLength(6)
    const ids = BOX_SURFACES.map((s) => s.id).sort()
    expect([...BOX_FACE_ORDER].sort()).toEqual(ids)
  })

  it('每個面都算得出尺寸', () => {
    for (const face of BOX_FACE_ORDER) {
      const s = surfaceSizeCm(face, 120, 90, 45)
      expect(s.widthCm).toBeGreaterThan(0)
      expect(s.heightCm).toBeGreaterThan(0)
    }
  })

  it('surface 標籤為繁體中文且不含破折號', () => {
    for (const s of BOX_SURFACES) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.label).not.toMatch(/[—–]/)
    }
  })
})
