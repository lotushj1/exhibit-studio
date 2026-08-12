export type BuildPreset = 'male' | 'female' | 'child'

export const BUILD_PRESETS: Record<
  BuildPreset,
  { label: string; defaultHeightCm: number; shoulderRatio: number; hipRatio: number; headRatio: number }
> = {
  male: { label: '男性', defaultHeightCm: 173, shoulderRatio: 0.26, hipRatio: 0.19, headRatio: 0.128 },
  female: { label: '女性', defaultHeightCm: 160, shoulderRatio: 0.235, hipRatio: 0.2, headRatio: 0.132 },
  child: { label: '兒童', defaultHeightCm: 120, shoulderRatio: 0.21, hipRatio: 0.18, headRatio: 0.165 },
}

export type Proportions = {
  legHeightCm: number
  torsoHeightCm: number
  neckHeightCm: number
  headHeightCm: number
  headWidthCm: number
  headCenterYCm: number
  torsoCenterYCm: number
  shoulderWidthCm: number
  hipWidthCm: number
  torsoDepthCm: number
  limbDiameterCm: number
  legCenterYCm: number
  armLengthCm: number
  armCenterYCm: number
}

/**
 * 依總身高與體型預設算出各部位尺寸。
 * 身高永遠等於各段高度加總，因此拉身高滑桿時比例不會走鐘。
 */
export function computeProportions(
  heightCm: number,
  preset: BuildPreset,
  girth: number,
): Proportions {
  const h = Math.max(1, heightCm)
  const g = Math.max(0.1, girth)
  const cfg = BUILD_PRESETS[preset]

  const headHeightCm = h * cfg.headRatio
  const neckHeightCm = h * 0.032
  // 兒童腿相對較短
  const legRatio = preset === 'child' ? 0.44 : 0.48
  const legHeightCm = h * legRatio
  const torsoHeightCm = h - headHeightCm - neckHeightCm - legHeightCm

  const shoulderWidthCm = h * cfg.shoulderRatio * (0.85 + 0.15 * g)
  const hipWidthCm = h * cfg.hipRatio * (0.85 + 0.15 * g)

  return {
    legHeightCm,
    torsoHeightCm,
    neckHeightCm,
    headHeightCm,
    headWidthCm: headHeightCm * 0.78,
    headCenterYCm: h - headHeightCm / 2,
    torsoCenterYCm: legHeightCm + torsoHeightCm / 2,
    shoulderWidthCm,
    hipWidthCm,
    torsoDepthCm: h * 0.075 * g,
    limbDiameterCm: h * 0.055 * g,
    legCenterYCm: legHeightCm / 2,
    armLengthCm: torsoHeightCm * 0.95,
    armCenterYCm: legHeightCm + torsoHeightCm * 0.55,
  }
}
