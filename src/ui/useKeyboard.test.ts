import { describe, expect, it } from 'vitest'
import { CAMERA_TRANSITION_CANCEL_EVENT } from '../scene/cameraPresets'
import { handleEscapeKey } from './useKeyboard'

describe('handleEscapeKey', () => {
  it('Escape 先發出相機補間取消事件，再清除非輸入狀態的選取', () => {
    const events: Event[] = []
    let cleared = 0
    const target = { dispatchEvent: (event: Event) => (events.push(event), true) }

    expect(handleEscapeKey({ key: 'Escape', target: null }, target, () => { cleared += 1 })).toBe(true)

    expect(events.map((event) => event.type)).toEqual([CAMERA_TRANSITION_CANCEL_EVENT])
    expect(cleared).toBe(1)
  })

  it('其他按鍵不取消相機，也不清除選取', () => {
    const events: Event[] = []
    let cleared = 0
    const target = { dispatchEvent: (event: Event) => (events.push(event), true) }

    expect(handleEscapeKey({ key: 'Enter', target: null }, target, () => { cleared += 1 })).toBe(false)

    expect(events).toHaveLength(0)
    expect(cleared).toBe(0)
  })
})
