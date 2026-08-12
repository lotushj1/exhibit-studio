import { describe, it, expect } from 'vitest'
import { computeTextureFit } from './textureFit'

const base = {
  imageWidthPx: 1000,
  imageHeightPx: 1000,
  scale: 1,
  offset: [0, 0] as [number, number],
  rotation: 0 as 0,
}

describe('computeTextureFit', () => {
  it('正方形圖貼正方形面，cover 不縮放', () => {
    const r = computeTextureFit({ ...base, surfaceWidthCm: 100, surfaceHeightCm: 100, fit: 'cover' })
    expect(r.repeat[0]).toBeCloseTo(1, 6)
    expect(r.repeat[1]).toBeCloseTo(1, 6)
    expect(r.offset[0]).toBeCloseTo(0, 6)
    expect(r.offset[1]).toBeCloseTo(0, 6)
  })

  it('cover 後圖片長寬比與面長寬比一致（不變形）', () => {
    const cases = [
      { w: 200, h: 100, iw: 1000, ih: 1000 },
      { w: 40, h: 90, iw: 1920, ih: 1080 },
      { w: 120, h: 90, iw: 1920, ih: 1080 },
      { w: 55, h: 233, iw: 800, ih: 600 },
    ]
    for (const c of cases) {
      const r = computeTextureFit({
        ...base, surfaceWidthCm: c.w, surfaceHeightCm: c.h,
        imageWidthPx: c.iw, imageHeightPx: c.ih, fit: 'cover',
      })
      // 取樣區域在圖片像素空間的長寬比，必須等於面的長寬比
      const sampledAspect = (c.iw * r.repeat[0]) / (c.ih * r.repeat[1])
      expect(sampledAspect).toBeCloseTo(c.w / c.h, 6)
    }
  })

  it('cover 時取樣區域完全落在圖片內（無留白）', () => {
    const r = computeTextureFit({
      ...base, surfaceWidthCm: 40, surfaceHeightCm: 90,
      imageWidthPx: 1920, imageHeightPx: 1080, fit: 'cover',
    })
    expect(r.repeat[0]).toBeLessThanOrEqual(1 + 1e-9)
    expect(r.repeat[1]).toBeLessThanOrEqual(1 + 1e-9)
    expect(r.offset[0]).toBeGreaterThanOrEqual(-1e-9)
    expect(r.offset[1]).toBeGreaterThanOrEqual(-1e-9)
    expect(r.offset[0] + r.repeat[0]).toBeLessThanOrEqual(1 + 1e-9)
    expect(r.offset[1] + r.repeat[1]).toBeLessThanOrEqual(1 + 1e-9)
  })

  it('cover 取樣區域置中', () => {
    const r = computeTextureFit({
      ...base, surfaceWidthCm: 200, surfaceHeightCm: 100,
      imageWidthPx: 1000, imageHeightPx: 1000, fit: 'cover',
    })
    expect(r.offset[0] + r.repeat[0] / 2).toBeCloseTo(0.5, 6)
    expect(r.offset[1] + r.repeat[1] / 2).toBeCloseTo(0.5, 6)
  })

  it('contain 時整張圖都看得到（取樣區域涵蓋整張圖）', () => {
    const r = computeTextureFit({
      ...base, surfaceWidthCm: 200, surfaceHeightCm: 100,
      imageWidthPx: 1000, imageHeightPx: 1000, fit: 'contain',
    })
    expect(r.repeat[0]).toBeGreaterThanOrEqual(1 - 1e-9)
    expect(r.repeat[1]).toBeGreaterThanOrEqual(1 - 1e-9)
    expect(r.offset[0]).toBeLessThanOrEqual(1e-9)
  })

  it('contain 後圖片長寬比與面長寬比一致（不變形）', () => {
    const cases = [
      { w: 200, h: 100, iw: 1000, ih: 1000 },
      { w: 40, h: 90, iw: 1920, ih: 1080 },
    ]
    for (const c of cases) {
      const r = computeTextureFit({
        ...base, surfaceWidthCm: c.w, surfaceHeightCm: c.h,
        imageWidthPx: c.iw, imageHeightPx: c.ih, fit: 'contain',
      })
      const sampledAspect = (c.iw * r.repeat[0]) / (c.ih * r.repeat[1])
      expect(sampledAspect).toBeCloseTo(c.w / c.h, 6)
    }
  })

  it('contain 取樣區域置中', () => {
    const r = computeTextureFit({
      ...base, surfaceWidthCm: 200, surfaceHeightCm: 100, fit: 'contain',
    })
    expect(r.offset[0] + r.repeat[0] / 2).toBeCloseTo(0.5, 6)
    expect(r.offset[1] + r.repeat[1] / 2).toBeCloseTo(0.5, 6)
  })

  it('repeat 模式依 scale 平鋪，scale 越小鋪越多次（正方形圖片，寬高平鋪次數相等）', () => {
    const r = computeTextureFit({
      ...base, surfaceWidthCm: 200, surfaceHeightCm: 100, fit: 'repeat', scale: 0.5,
    })
    expect(r.repeat[0]).toBeCloseTo(4, 6)   // 200cm / (100cm*0.5) = 4
    expect(r.repeat[1]).toBeCloseTo(2, 6)   // 100cm / (100cm*0.5) = 2
  })

  it('repeat 模式每一格維持圖片原始長寬比（不變形）——非正方形圖片是關鍵案例', () => {
    // 瀏覽器實測抓到的問題：repeat 模式若直接用 wCm/unitCm、hCm/unitCm 各自
    // 獨立算 repeat，等於把每一格拉成 unitCm x unitCm 的正方形。圖片本身若
    // 不是正方形（例如這裡的 1920x1080），套用到非正方形的一格就會被硬擠
    // 變形（圓形圖案會變橢圓）。正確作法是讓一格的實際高（cm）依圖片長寬比
    // 換算，而不是跟寬一樣直接套 unitCm。
    const cases = [
      { w: 120, h: 82, iw: 1920, ih: 1080 },
      { w: 40, h: 82, iw: 1920, ih: 1080 },
      { w: 55, h: 233, iw: 800, ih: 600 },
    ]
    for (const c of cases) {
      const r = computeTextureFit({
        ...base, surfaceWidthCm: c.w, surfaceHeightCm: c.h,
        imageWidthPx: c.iw, imageHeightPx: c.ih, fit: 'repeat', scale: 1,
      })
      // 一格的物理寬高（cm）= 面尺寸 / repeat 次數，其長寬比必須等於圖片長寬比。
      const tileWidthCm = c.w / r.repeat[0]
      const tileHeightCm = c.h / r.repeat[1]
      expect(tileWidthCm / tileHeightCm).toBeCloseTo(c.iw / c.ih, 6)
    }
  })

  it('cover 與 contain 忽略 scale', () => {
    const a = computeTextureFit({ ...base, surfaceWidthCm: 200, surfaceHeightCm: 100, fit: 'cover', scale: 1 })
    const b = computeTextureFit({ ...base, surfaceWidthCm: 200, surfaceHeightCm: 100, fit: 'cover', scale: 3 })
    expect(a.repeat).toEqual(b.repeat)
    const c = computeTextureFit({ ...base, surfaceWidthCm: 200, surfaceHeightCm: 100, fit: 'contain', scale: 1 })
    const d = computeTextureFit({ ...base, surfaceWidthCm: 200, surfaceHeightCm: 100, fit: 'contain', scale: 3 })
    expect(c.repeat).toEqual(d.repeat)
  })

  it('offset 位移套用在計算結果之上', () => {
    const a = computeTextureFit({ ...base, surfaceWidthCm: 200, surfaceHeightCm: 100, fit: 'cover' })
    const b = computeTextureFit({
      ...base, surfaceWidthCm: 200, surfaceHeightCm: 100, fit: 'cover', offset: [0.1, -0.2],
    })
    expect(b.offset[0]).toBeCloseTo(a.offset[0] + 0.1, 6)
    expect(b.offset[1]).toBeCloseTo(a.offset[1] - 0.2, 6)
  })

  it('旋轉 90 度時長寬比判斷跟著轉，且回傳弧度與中心點', () => {
    const r = computeTextureFit({
      ...base, surfaceWidthCm: 200, surfaceHeightCm: 100,
      imageWidthPx: 1000, imageHeightPx: 500, fit: 'cover', rotation: 90,
    })
    expect(r.rotation).toBeCloseTo(Math.PI / 2, 6)
    expect(r.center).toEqual([0.5, 0.5])
  })

  it('offset 非有限值（Finding 4：專案檔驗證的最後一道防線）不產生 NaN，當成 0 處理', () => {
    const withBadOffset = computeTextureFit({
      ...base, surfaceWidthCm: 200, surfaceHeightCm: 100, fit: 'cover',
      offset: [NaN, Infinity] as unknown as [number, number],
    })
    expect(Number.isFinite(withBadOffset.offset[0])).toBe(true)
    expect(Number.isFinite(withBadOffset.offset[1])).toBe(true)

    const withZeroOffset = computeTextureFit({
      ...base, surfaceWidthCm: 200, surfaceHeightCm: 100, fit: 'cover', offset: [0, 0],
    })
    // 非有限值被當成 0，結果跟直接傳 [0, 0] 一致
    expect(withBadOffset.offset).toEqual(withZeroOffset.offset)
  })

  it('退化輸入不產生 NaN 或 Infinity', () => {
    const bad = [
      { surfaceWidthCm: 0, surfaceHeightCm: 100, imageWidthPx: 1000, imageHeightPx: 1000 },
      { surfaceWidthCm: 100, surfaceHeightCm: 0, imageWidthPx: 1000, imageHeightPx: 1000 },
      { surfaceWidthCm: 100, surfaceHeightCm: 100, imageWidthPx: 0, imageHeightPx: 1000 },
      { surfaceWidthCm: 100, surfaceHeightCm: 100, imageWidthPx: 1000, imageHeightPx: 0 },
    ]
    for (const b of bad) {
      for (const fit of ['cover', 'contain', 'repeat'] as const) {
        const r = computeTextureFit({ ...base, ...b, fit })
        for (const n of [...r.repeat, ...r.offset, r.rotation]) {
          expect(Number.isFinite(n)).toBe(true)
        }
      }
    }
  })
})
