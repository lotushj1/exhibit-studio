import { mToCm } from '../lib/units'

export type DimensionLine = {
  axis: 'x' | 'y' | 'z'
  from: [number, number, number]
  to: [number, number, number]
  labelPos: [number, number, number]
  labelCm: number
}

/** 標註線離物件表面的距離（公尺）。 */
const OFFSET_M = 0.08

/**
 * 依包圍盒產生長、寬、高三條標註線。
 * 三條線各自貼在物件的一個外側角落，不會壓在物件上。
 */
export function buildDimensions(
  sizeM: [number, number, number],
  centerM: [number, number, number],
): DimensionLine[] {
  const [w, h, d] = sizeM.map((n) => (Number.isFinite(n) ? n : 0)) as [number, number, number]
  const [cx, cy, cz] = centerM.map((n) => (Number.isFinite(n) ? n : 0)) as [number, number, number]

  const minY = cy - h / 2
  const maxZ = cz + d / 2 + OFFSET_M
  const maxX = cx + w / 2 + OFFSET_M

  const lines: DimensionLine[] = [
    {
      axis: 'x',
      from: [cx - w / 2, minY, maxZ],
      to: [cx + w / 2, minY, maxZ],
      labelPos: [cx, minY, maxZ],
      labelCm: Math.round(mToCm(w)),
    },
    {
      axis: 'y',
      from: [maxX, minY, cz + d / 2],
      to: [maxX, minY + h, cz + d / 2],
      labelPos: [maxX, minY + h / 2, cz + d / 2],
      labelCm: Math.round(mToCm(h)),
    },
    {
      axis: 'z',
      from: [maxX, minY, cz - d / 2],
      to: [maxX, minY, cz + d / 2],
      labelPos: [maxX, minY, cz],
      labelCm: Math.round(mToCm(d)),
    },
  ]

  return lines
}
