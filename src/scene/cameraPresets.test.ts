import { describe, it, expect } from 'vitest'
import {
  CAMERA_PRESETS,
  CAMERA_ORDER,
  CAMERA_TRANSITION_CANCEL_EVENT,
  emitCameraTransitionCancel,
  framePreset,
  orthoZoomForFrame,
} from './cameraPresets'

describe('CAMERA_PRESETS', () => {
  it('可以發出相機補間取消事件，讓 Esc 清掉待套用動畫', () => {
    const events: Event[] = []
    const target = { dispatchEvent: (event: Event) => (events.push(event), true) }

    emitCameraTransitionCancel(target)

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe(CAMERA_TRANSITION_CANCEL_EVENT)
  })

  it('五種預設都存在且順序完整', () => {
    expect(CAMERA_ORDER).toEqual(['front', 'hero', 'top', 'side', 'eye'])
    for (const id of CAMERA_ORDER) expect(CAMERA_PRESETS[id]).toBeDefined()
  })

  it('每個預設都有繁體中文標籤且不含破折號', () => {
    for (const id of CAMERA_ORDER) {
      expect(CAMERA_PRESETS[id].label.length).toBeGreaterThan(0)
      expect(CAMERA_PRESETS[id].label).not.toMatch(/[—–]/)
    }
  })

  it('人眼視角的相機高度是 1.6 公尺', () => {
    const r = framePreset('eye', 3)
    expect(r.position[1]).toBeCloseTo(1.6, 6)
    expect(r.target[1]).toBeCloseTo(1.6, 6)
  })

  it('人眼視角用 50mm 等效焦距（約 39.6 度）', () => {
    expect(CAMERA_PRESETS.eye.fov).toBeCloseTo(39.6, 1)
  })

  it('俯視相機在正上方', () => {
    const r = framePreset('top', 4)
    expect(r.position[0]).toBeCloseTo(0, 6)
    expect(r.position[2]).toBeCloseTo(0, 6)
    expect(r.position[1]).toBeGreaterThan(4)
  })

  it('場景越大相機退越遠', () => {
    const near = framePreset('hero', 1)
    const far = framePreset('hero', 10)
    const dist = (p: [number, number, number]) => Math.hypot(p[0], p[1], p[2])
    expect(dist(far.position)).toBeGreaterThan(dist(near.position))
  })

  it('場景半徑為 0 時仍有合理距離，不會貼到原點', () => {
    for (const id of CAMERA_ORDER) {
      const r = framePreset(id, 0)
      const dist = Math.hypot(...r.position)
      expect(dist).toBeGreaterThan(0.5)
      expect(Number.isFinite(dist)).toBe(true)
    }
  })

  it('不傳 projection（預設透視）時人眼視角維持原本的 1.6 公尺高度，不受退化邏輯影響', () => {
    const r = framePreset('eye', 5)
    expect(r.position[1]).toBeCloseTo(1.6, 6)
  })

  it('正交模式下人眼視角退化成跟側視完全相同的位置與注視點', () => {
    const eyeOrtho = framePreset('eye', 4, 'orthographic')
    const side = framePreset('side', 4, 'orthographic')
    expect(eyeOrtho.position).toEqual(side.position)
    expect(eyeOrtho.target).toEqual(side.target)
  })

  it('正交模式不影響其他四個預設（跟透視模式算出同樣的位置與注視點）', () => {
    for (const id of CAMERA_ORDER) {
      if (id === 'eye') continue
      const persp = framePreset(id, 6)
      const ortho = framePreset(id, 6, 'orthographic')
      expect(ortho.position).toEqual(persp.position)
      expect(ortho.target).toEqual(persp.target)
    }
  })
})

describe('orthoZoomForFrame', () => {
  it('對所有預設回傳有限的正數', () => {
    for (const id of CAMERA_ORDER) {
      const zoom = orthoZoomForFrame(id, 3, 800)
      expect(Number.isFinite(zoom)).toBe(true)
      expect(zoom).toBeGreaterThan(0)
    }
  })

  it('場景半徑為 0 時仍回傳有限的正數，不會除以零爆炸', () => {
    for (const id of CAMERA_ORDER) {
      const zoom = orthoZoomForFrame(id, 0, 800)
      expect(Number.isFinite(zoom)).toBe(true)
      expect(zoom).toBeGreaterThan(0)
    }
  })

  it('場景越大，zoom 越小（正交相機要縮小倍率才能看到更多範圍）', () => {
    const near = orthoZoomForFrame('hero', 1, 800)
    const far = orthoZoomForFrame('hero', 10, 800)
    expect(far).toBeLessThan(near)
  })

  it('視埠像素越高，同樣的框景範圍需要越大的 zoom（單位換算是線性的）', () => {
    const small = orthoZoomForFrame('hero', 3, 400)
    const large = orthoZoomForFrame('hero', 3, 800)
    expect(large).toBeCloseTo(small * 2, 6)
  })

  it('正交模式下人眼視角的 zoom 跟側視完全相同（退化一致性）', () => {
    const eyeZoom = orthoZoomForFrame('eye', 5, 600, 'orthographic')
    const sideZoom = orthoZoomForFrame('side', 5, 600, 'orthographic')
    expect(eyeZoom).toBe(sideZoom)
  })
})
