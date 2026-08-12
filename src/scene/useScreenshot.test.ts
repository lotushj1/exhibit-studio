import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCaptureButtonLabel, waitForScreenshotPaint } from './useScreenshot'

describe('截圖忙碌狀態', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('截圖進行中顯示繁中處理中文字，閒置時顯示截圖', () => {
    expect(getCaptureButtonLabel(false)).toBe('截圖')
    expect(getCaptureButtonLabel(true)).toBe('截圖處理中…')
  })

  it('至少跨過一輪 paint 後才繼續，避免重繪工作搶在忙碌文字顯示前開始', async () => {
    const frames: Array<FrameRequestCallback> = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })

    let settled = false
    const waiting = waitForScreenshotPaint().then(() => {
      settled = true
    })

    expect(frames).toHaveLength(1)
    expect(settled).toBe(false)

    frames.shift()!(performance.now())
    await Promise.resolve()

    expect(frames).toHaveLength(1)
    expect(settled).toBe(false)

    frames.shift()!(performance.now())
    await waiting

    expect(settled).toBe(true)
  })
})
