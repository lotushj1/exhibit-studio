import { describe, it, expect } from 'vitest'
import { labelFontSizePx, localLabelToWorld, ndcToCanvasPixel } from './screenshotLabels'

describe('localLabelToWorld', () => {
  it('沒有旋轉時等於本地座標加上群組位移', () => {
    const world = localLabelToWorld([1, 0.5, -2], [3, 0, 4], 0)
    expect(world[0]).toBeCloseTo(4, 6)
    expect(world[1]).toBeCloseTo(0.5, 6)
    expect(world[2]).toBeCloseTo(2, 6)
  })

  it('旋轉 90 度時 X/Z 互換方向（右手座標系）', () => {
    const world = localLabelToWorld([1, 0, 0], [0, 0, 0], Math.PI / 2)
    expect(world[0]).toBeCloseTo(0, 6)
    expect(world[2]).toBeCloseTo(-1, 6)
  })

  it('旋轉 180 度時 X/Z 反向', () => {
    const world = localLabelToWorld([1, 0, 1], [0, 0, 0], Math.PI)
    expect(world[0]).toBeCloseTo(-1, 6)
    expect(world[2]).toBeCloseTo(-1, 6)
  })

  it('Y 軸不受旋轉影響', () => {
    const world = localLabelToWorld([1, 2, 3], [0, 0, 0], 1.234)
    expect(world[1]).toBeCloseTo(2, 6)
  })
})

describe('ndcToCanvasPixel', () => {
  it('畫面中心 (0, 0) 對應到 canvas 正中央', () => {
    const { x, y } = ndcToCanvasPixel(0, 0, 800, 600)
    expect(x).toBeCloseTo(400, 6)
    expect(y).toBeCloseTo(300, 6)
  })

  it('左上角 (-1, 1) 對應到 canvas 原點', () => {
    const { x, y } = ndcToCanvasPixel(-1, 1, 800, 600)
    expect(x).toBeCloseTo(0, 6)
    expect(y).toBeCloseTo(0, 6)
  })

  it('右下角 (1, -1) 對應到 canvas 右下角', () => {
    const { x, y } = ndcToCanvasPixel(1, -1, 800, 600)
    expect(x).toBeCloseTo(800, 6)
    expect(y).toBeCloseTo(600, 6)
  })

  it('canvas 尺寸放大兩倍時像素座標等比放大', () => {
    const base = ndcToCanvasPixel(0.5, -0.5, 800, 600)
    const doubled = ndcToCanvasPixel(0.5, -0.5, 1600, 1200)
    expect(doubled.x).toBeCloseTo(base.x * 2, 6)
    expect(doubled.y).toBeCloseTo(base.y * 2, 6)
  })
})

describe('labelFontSizePx', () => {
  it('1x 截圖、pixelRatio 1 時等於原始字級', () => {
    expect(labelFontSizePx(12, 1, 1)).toBe(12)
  })

  it('2x 截圖時字級加倍', () => {
    expect(labelFontSizePx(12, 1, 2)).toBe(24)
  })

  it('裝置畫素比與截圖倍率一起套用', () => {
    expect(labelFontSizePx(12, 2, 2)).toBe(48)
  })
})
