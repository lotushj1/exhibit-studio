import { cmToM } from '../../lib/units'

export type BoxFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'

/** 公分尺寸轉 Three.js 的 [寬, 高, 深]。 */
export function boxSizeM(wCm: number, hCm: number, dCm: number): [number, number, number] {
  return [cmToM(wCm), cmToM(hCm), cmToM(dCm)]
}

/**
 * 取得箱體某一面的實際長寬（公分）。
 * 這是貼圖不變形的前提：computeTextureFit 需要面的真實比例，
 * 而不是箱體的整體尺寸。
 */
export function surfaceSizeCm(
  face: BoxFace,
  wCm: number,
  hCm: number,
  dCm: number,
): { widthCm: number; heightCm: number } {
  switch (face) {
    case 'front':
    case 'back':
      return { widthCm: wCm, heightCm: hCm }
    case 'left':
    case 'right':
      return { widthCm: dCm, heightCm: hCm }
    case 'top':
    case 'bottom':
      return { widthCm: wCm, heightCm: dCm }
  }
}

/**
 * 層板的 Y 座標（公尺，物件本地座標）。
 * 在可用高度內等距分布，兩端各留一段，不貼齊頂底。
 */
export function shelfPositionsM(innerHeightCm: number, count: number, baseYCm: number): number[] {
  if (count <= 0) return []
  const gap = innerHeightCm / (count + 1)
  const ys: number[] = []
  for (let i = 1; i <= count; i++) {
    ys.push(cmToM(baseYCm + gap * i))
  }
  return ys
}
