/** 公分轉 Three.js 世界單位（公尺）。 */
export function cmToM(cm: number): number {
  return cm / 100
}

/** Three.js 世界單位（公尺）轉公分。 */
export function mToCm(m: number): number {
  return m * 100
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** 貼齊到最近的 step 倍數。 */
export function snapTo(v: number, step: number): number {
  return Math.round(v / step) * step
}
