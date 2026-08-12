export type FinishId =
  | 'matte' | 'gloss' | 'goldFoil' | 'silverFoil' | 'brushedMetal' | 'wood'
  | 'acrylic' | 'clearGlass' | 'frostedGlass'

/** 可直接展開到 meshPhysicalMaterial 的屬性，不含 color。 */
export type MaterialProps = {
  roughness: number
  metalness: number
  clearcoat?: number
  clearcoatRoughness?: number
  transparent?: boolean
  opacity?: number
  transmission?: number
  ior?: number
  thickness?: number
  envMapIntensity?: number
  side?: number
}

export type FinishDef = {
  label: string
  /** 透明類材質在高品質開關關閉與開啟時的參數不同。 */
  fast: MaterialProps
  highQuality?: MaterialProps
  /** 預設顏色建議值，使用者可覆寫。 */
  suggestedColor: string
}

export const FINISHES: Record<FinishId, FinishDef> = {
  matte: {
    label: '消光霧面',
    // 中間調暖灰。淺色外觀的背景是 #e4e7eb，深色是 #1a1d21，預設色必須同時
    // 跟兩者拉開對比，不然櫃體會融進背景裡看不出輪廓。
    suggestedColor: '#85817c',
    fast: { roughness: 0.9, metalness: 0, envMapIntensity: 0.6 },
  },
  gloss: {
    label: '亮面烤漆',
    // 比消光稍亮，維持烤漆的質感差異，但一樣要跟淺色背景拉開（見上）。
    suggestedColor: '#89847f',
    fast: { roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1 },
  },
  goldFoil: {
    label: '燙金',
    suggestedColor: '#c9a227',
    fast: { roughness: 0.25, metalness: 1, envMapIntensity: 1.2 },
  },
  silverFoil: {
    label: '燙銀',
    suggestedColor: '#c8ccd0',
    fast: { roughness: 0.2, metalness: 1, envMapIntensity: 1.2 },
  },
  brushedMetal: {
    label: '拉絲金屬',
    suggestedColor: '#b8bdc2',
    fast: { roughness: 0.45, metalness: 1, envMapIntensity: 1 },
  },
  wood: {
    label: '木紋',
    suggestedColor: '#a9805a',
    fast: { roughness: 0.7, metalness: 0, envMapIntensity: 0.5 },
  },
  acrylic: {
    label: '透明壓克力',
    suggestedColor: '#ffffff',
    fast: { roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, envMapIntensity: 1 },
    highQuality: { roughness: 0.05, metalness: 0, transmission: 0.95, ior: 1.49, thickness: 0.03, transparent: true, opacity: 1 },
  },
  clearGlass: {
    label: '清玻璃',
    suggestedColor: '#ffffff',
    fast: { roughness: 0.02, metalness: 0, transparent: true, opacity: 0.18, envMapIntensity: 1.2 },
    highQuality: { roughness: 0.02, metalness: 0, transmission: 1, ior: 1.52, thickness: 0.06, transparent: true, opacity: 1 },
  },
  frostedGlass: {
    label: '霧面玻璃',
    suggestedColor: '#ffffff',
    fast: { roughness: 0.5, metalness: 0, transparent: true, opacity: 0.45, envMapIntensity: 0.8 },
    highQuality: { roughness: 0.5, metalness: 0, transmission: 0.9, ior: 1.52, thickness: 0.06, transparent: true, opacity: 1 },
  },
}

/** 選單顯示順序。 */
export const FINISH_ORDER: FinishId[] = [
  'matte', 'gloss', 'wood', 'brushedMetal', 'goldFoil', 'silverFoil',
  'acrylic', 'clearGlass', 'frostedGlass',
]

/**
 * 取得實際要套用的材質參數。
 * transmission 需要額外的場景重繪且明顯掉幀，因此只在 highQualityGlass 開啟時使用。
 */
export function resolveFinish(id: FinishId, highQualityGlass: boolean): MaterialProps {
  const def = FINISHES[id]
  if (highQualityGlass && def.highQuality) return def.highQuality
  return def.fast
}
