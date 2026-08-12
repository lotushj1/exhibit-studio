export type FitMode = 'cover' | 'contain' | 'repeat'
export type Rotation = 0 | 90 | 180 | 270

export type FitInput = {
  /** 這個面的實際寬度（公分）。 */
  surfaceWidthCm: number
  /** 這個面的實際高度（公分）。 */
  surfaceHeightCm: number
  imageWidthPx: number
  imageHeightPx: number
  fit: FitMode
  /** 只在 repeat 模式生效：一次平鋪代表多少公分。 */
  scale: number
  /** 使用者微調位移，套用在計算結果之上。 */
  offset: [number, number]
  rotation: Rotation
}

export type FitResult = {
  repeat: [number, number]
  offset: [number, number]
  /** 弧度，直接指派給 Texture.rotation。 */
  rotation: number
  /** 旋轉中心，固定為圖片中心。 */
  center: [number, number]
}

/**
 * repeat 模式下，scale=1 代表一次平鋪的「寬」涵蓋 100 公分。
 * 高不是另一個獨立的 100 公分——一格的高由圖片長寬比反推
 * （`unitCm / imageAspect`，見下方 `ry` 計算），這樣每一格貼出來的圖才會維持
 * 原始長寬比，不會被拉成正方形。長寬比不是 1:1 的圖，一格的實際高度因此
 * 不會剛好是 100 公分。
 */
const REPEAT_BASE_CM = 100

function safe(n: number, fallback: number): number {
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/**
 * 計算 Texture 的 repeat 與 offset，使貼圖在指定尺寸的面上不變形。
 *
 * repeat 小於 1 代表只取樣圖片的一部分（cover 的裁切），
 * 大於 1 代表取樣範圍超出圖片（contain 的留白，需搭配 ClampToEdgeWrapping）。
 */
export function computeTextureFit(input: FitInput): FitResult {
  const wCm = safe(input.surfaceWidthCm, 1)
  const hCm = safe(input.surfaceHeightCm, 1)
  const iw = safe(input.imageWidthPx, 1)
  const ih = safe(input.imageHeightPx, 1)

  // 旋轉 90 或 270 度時，圖片的有效長寬互換
  const swapped = input.rotation === 90 || input.rotation === 270
  const imageAspect = swapped ? ih / iw : iw / ih
  const surfaceAspect = wCm / hCm

  let rx: number
  let ry: number

  if (input.fit === 'repeat') {
    // 一個平鋪單位的寬固定為 unitCm；高則依圖片長寬比換算（unitCm / imageAspect），
    // 讓每一格平鋪出來的圖片維持原始長寬比。如果高也直接用 unitCm（跟寬一樣），
    // 每一格會被拉成 unitCm x unitCm 的正方形，非正方形的圖片（例如這裡的
    // 1920x1080 測試圖）就會被硬擠成正方形，圓形圖案會變成橢圓——這正是
    // 瀏覽器實測「平鋪」模式時抓到的變形，且只有非正方形圖片才會露餡，
    // 原本的單元測試剛好只測過正方形圖片（1000x1000），沒有測到這個問題。
    const unitCm = safe(input.scale, 1) * REPEAT_BASE_CM
    rx = wCm / unitCm
    ry = (hCm * imageAspect) / unitCm
  } else {
    // cover：取樣區域內縮到圖片內；contain：取樣區域外擴超出圖片
    const wider = imageAspect > surfaceAspect
    const shrinkX = input.fit === 'cover' ? wider : !wider
    if (shrinkX) {
      rx = surfaceAspect / imageAspect
      ry = 1
    } else {
      rx = 1
      ry = imageAspect / surfaceAspect
    }
  }

  // 置中：讓取樣區域的中心對齊圖片中心
  const baseOffsetX = (1 - rx) / 2
  const baseOffsetY = (1 - ry) / 2

  // 防禦性保護（Finding 4）：`offset` 理論上該由 `persistence.reconcile`
  // 擋在存檔／專案檔的入口就驗過，但這裡是貼圖定位計算的最後一關，不能
  // 假設呼叫端一定守規矩——非有限值直接當成 0（不位移），不讓一個壞掉的
  // offset 讓 `tex.offset.set(...)` 吃到 NaN、貼圖整個消失。
  const offsetX = Number.isFinite(input.offset[0]) ? input.offset[0] : 0
  const offsetY = Number.isFinite(input.offset[1]) ? input.offset[1] : 0

  return {
    repeat: [rx, ry],
    offset: [baseOffsetX + offsetX, baseOffsetY + offsetY],
    rotation: (input.rotation * Math.PI) / 180,
    center: [0.5, 0.5],
  }
}
