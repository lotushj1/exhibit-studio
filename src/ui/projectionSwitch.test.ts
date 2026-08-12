import { describe, expect, it } from 'vitest'
import {
  PROJECTION_SWITCH_MESSAGE,
  PROJECTION_SWITCH_MIN_VISIBLE_MS,
  projectionSwitchLabel,
  projectionSwitchRemainingMs,
} from './projectionSwitch'

describe('projectionSwitchLabel', () => {
  it('切換期間提供可見的忙碌提示', () => {
    expect(projectionSwitchLabel(true)).toBe(PROJECTION_SWITCH_MESSAGE)
  })

  it('非切換期間不顯示提示', () => {
    expect(projectionSwitchLabel(false)).toBeNull()
  })

  it('兩個 rAF 後仍未滿最短可見時間時，回傳剩餘等待時間', () => {
    expect(projectionSwitchRemainingMs(1_000, 1_016)).toBe(PROJECTION_SWITCH_MIN_VISIBLE_MS - 16)
    expect(projectionSwitchRemainingMs(1_000, 1_300)).toBe(0)
  })
})
