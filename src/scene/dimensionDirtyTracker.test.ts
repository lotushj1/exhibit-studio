import { describe, it, expect } from 'vitest'
import { DimensionDirtyTracker } from './dimensionDirtyTracker'

describe('DimensionDirtyTracker', () => {
  it('同一個物件同一個 key 再呼叫一次不算髒（不用重新量測）', () => {
    const tracker = new DimensionDirtyTracker()
    expect(tracker.isDirty('a', 'k1')).toBe(true)
    expect(tracker.isDirty('a', 'k1')).toBe(false)
    expect(tracker.isDirty('a', 'k1')).toBe(false)
  })

  it('key 變了才算髒（需要重新量測）', () => {
    const tracker = new DimensionDirtyTracker()
    tracker.isDirty('a', 'k1')
    expect(tracker.isDirty('a', 'k2')).toBe(true)
    expect(tracker.isDirty('a', 'k2')).toBe(false)
  })

  it('不同 id 各自獨立追蹤，互不影響（拖曳一個物件不會讓其他物件被判定為髒）', () => {
    const tracker = new DimensionDirtyTracker()
    tracker.isDirty('a', 'k1')
    tracker.isDirty('b', 'k1')
    // 只有 a 的 key 變了
    expect(tracker.isDirty('a', 'k2')).toBe(true)
    // b 的 key 沒變，不該被判定為髒
    expect(tracker.isDirty('b', 'k1')).toBe(false)
  })

  it('forget 之後同一個 key 會重新被視為髒（物件被隱藏又顯示、或標註模式重新涵蓋它）', () => {
    const tracker = new DimensionDirtyTracker()
    tracker.isDirty('a', 'k1')
    expect(tracker.isDirty('a', 'k1')).toBe(false)
    tracker.forget('a')
    expect(tracker.isDirty('a', 'k1')).toBe(true)
  })

  it('trackedIds 回傳目前追蹤中的所有 id', () => {
    const tracker = new DimensionDirtyTracker()
    tracker.isDirty('a', 'k1')
    tracker.isDirty('b', 'k1')
    expect(tracker.trackedIds().sort()).toEqual(['a', 'b'])
    tracker.forget('a')
    expect(tracker.trackedIds()).toEqual(['b'])
  })

  it('clear 清空全部追蹤紀錄', () => {
    const tracker = new DimensionDirtyTracker()
    tracker.isDirty('a', 'k1')
    tracker.isDirty('b', 'k1')
    tracker.clear()
    expect(tracker.trackedIds()).toEqual([])
    expect(tracker.isDirty('a', 'k1')).toBe(true)
  })
})
