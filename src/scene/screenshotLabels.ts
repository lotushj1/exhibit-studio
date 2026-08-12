/**
 * 截圖合成尺寸標註數字用的純數學函式。
 *
 * 背景：Task 21 的公分數字是 drei 的 `Html`（疊在 Canvas 上方的真實 DOM），
 * 不會被 `gl.domElement.toBlob()` 擷取進去（見 Dimensions.tsx 內的說明）。
 * Task 22 選擇「截圖時把數字畫回 2D canvas」的方案：擷取 WebGL 畫面後，
 * 對每一條標註線的 `labelPos`（Dimensions 本地座標）算出世界座標、投影到
 * 螢幕像素座標，再用 `fillText` 疊上公分數字。
 *
 * 這個檔案只放「不需要真的建立 Three.js 場景就能驗證」的部分：
 * - 本地座標套用選取物件的 position + Y 軸旋轉，換算成世界座標
 *   （其餘的「世界座標 → NDC」交給 THREE.Vector3.project(camera) 本身，
 *   不重造這個輪子）
 * - NDC（-1~1，Y 軸向上，原點在畫面中心）轉成 canvas 像素座標
 *   （原點在左上角，Y 軸向下）
 * - 字級隨裝置畫素比與截圖倍率（1x/2x）縮放，維持跟畫面上顯示時一致的
 *   相對大小——2x 模式下 canvas 像素尺寸雙倍，如果字級的像素數字不跟著
 *   放大，疊上去的字看起來會只有正常大小的一半。
 */

/**
 * 把 Dimensions 本地座標的標籤位置轉成世界座標。
 *
 * 對應 Dimensions.tsx 裡包住所有標註線的
 * `<group position={placement.position} rotation={[0, placement.rotationY, 0]}>`——
 * Three.js 對向量套用 Y 軸旋轉矩陣 Ry(θ) 的公式是
 * `x' = x·cosθ + z·sinθ`、`z' = -x·sinθ + z·cosθ`、`y' = y`，
 * 這裡就是照這個公式手算，再加上 group 的 position 位移。
 */
export function localLabelToWorld(
  localPos: [number, number, number],
  groupPosition: [number, number, number],
  rotationY: number,
): [number, number, number] {
  const [x, y, z] = localPos
  const cos = Math.cos(rotationY)
  const sin = Math.sin(rotationY)
  return [groupPosition[0] + x * cos + z * sin, groupPosition[1] + y, groupPosition[2] - x * sin + z * cos]
}

/**
 * 把 NDC 座標（-1~1，Y 軸向上，來自 `Vector3.project(camera)`）轉成
 * canvas 2D context 的像素座標（原點左上角，Y 軸向下）。
 */
export function ndcToCanvasPixel(
  ndcX: number,
  ndcY: number,
  canvasWidthPx: number,
  canvasHeightPx: number,
): { x: number; y: number } {
  return {
    x: ((ndcX + 1) / 2) * canvasWidthPx,
    y: ((1 - ndcY) / 2) * canvasHeightPx,
  }
}

/**
 * 截圖疊字用的字級（像素）。`basePx` 是設計時預想的 CSS 像素字級
 * （跟 Task 21 `Html` 標籤的 `fontSize: 12` 對齊），乘上裝置畫素比
 * （讓一般螢幕的實際像素密度一致）再乘上截圖倍率（使用者選的 1x/2x
 * 匯出解析度）。
 */
export function labelFontSizePx(basePx: number, pixelRatio: number, captureScale: 1 | 2): number {
  return basePx * pixelRatio * captureScale
}
