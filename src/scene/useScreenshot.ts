import { create } from 'zustand'
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { downloadBlob, safeFileName } from '../lib/download'
import { useSceneStore } from '../store/sceneStore'
import { useAppearanceStore } from '../store/appearanceStore'
import { useDimensionPlacementStore, type DimensionPlacementMap } from './dimensionsBridge'
import { labelFontSizePx, localLabelToWorld, ndcToCanvasPixel } from './screenshotLabels'
import { SCENE_COLORS } from './sceneColors'

type ScreenshotState = {
  capture: ((scale: 1 | 2) => Promise<void>) | null
  setCapture: (fn: ScreenshotState['capture']) => void
  /**
   * 是否正在截圖中。兩個用途：(1) `capture()` 內部拿它擋掉重入——
   * 快速連點兩個解析度選項時，第二次呼叫如果照樣執行，會在畫面已經被
   * 第一次呼叫放大過的當下呼叫 `gl.getPixelRatio()`，把「放大後的值」
   * 誤記成「原本的值」，之後的還原就錯了，畫面永久卡在放大狀態；
   * (2) `TopBar` 訂閱這個旗標，截圖進行中停用兩個選單項目，使用者從
   * UI 上就看不到能重複點的按鈕，兩層防護疊加。
   */
  capturing: boolean
  setCapturing: (v: boolean) => void
}

export const useScreenshotStore = create<ScreenshotState>((set) => ({
  capture: null,
  setCapture: (fn) => set({ capture: fn }),
  capturing: false,
  setCapturing: (v) => set({ capturing: v }),
}))

/** 顯示截圖按鈕目前的狀態，讓介面與測試共用同一份文案。 */
export function getCaptureButtonLabel(capturing: boolean): string {
  return capturing ? '截圖處理中…' : '截圖'
}

/**
 * 等待至少一輪瀏覽器 paint 再開始同步的 WebGL 重繪。
 *
 * 第一個 animation frame 會在瀏覽器 paint 前執行，第二個 frame 則會在
 * 第一個 frame 之後的 paint 完成後才執行。這讓 `capturing=true` 的按鈕
 * 狀態有機會真的被使用者看見，而不是被後面的同步 `gl.render()` 擋住。
 * 沒有瀏覽器 animation frame（例如 SSR 或單元測試）時，用一個零延遲的
 * task 讓呼叫端仍保持非同步。
 */
export function waitForScreenshotPaint(): Promise<void> {
  const requestFrame = typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : null
  if (!requestFrame) return new Promise((resolve) => setTimeout(resolve, 0))

  return new Promise((resolve) => {
    requestFrame(() => {
      requestFrame(() => resolve())
    })
  })
}

const LABEL_BASE_FONT_PX = 12

/**
 * 把公分數字疊回截圖。
 *
 * 尺寸標註的三條線是 WebGL 幾何，已經在 `rawBlob` 裡；公分數字是 drei
 * 的 `Html`（見 Dimensions.tsx 的說明），不會被 `gl.domElement.toBlob()`
 * 抓到，所以這裡另外開一個 2D canvas：把截圖畫上去當底圖，再對每個標籤
 * 算出世界座標、用同一個相機投影到螢幕像素，`fillText` 補上公分數字。
 *
 * `placements` 是 id → `DimensionPlacement` 的 map（見 `dimensionsBridge.ts`），
 * 「全部物件」模式下每個可見物件各自一筆——這裡走訪整個 map，把每一個
 * 物件的三個標籤都疊上去，「選取物件」模式下 map 只會有一筆，行為跟
 * 原本單一物件時完全一致。
 *
 * 座標系換算分兩段：
 * 1. `localLabelToWorld`——Dimensions 本地座標套用該物件的 position/
 *    rotationY，這段是純函式，Task 22 有另外寫測試（screenshotLabels.test.ts）。
 * 2. `Vector3.project(camera)`——世界座標投影到 NDC，直接用 Three.js
 *    自己的相機投影矩陣，不重造這個輪子（也不需要另外測試，這是
 *    three.js 本身的職責）。
 *
 * `pixelRatio`/`scale` 都要餵進字級與圓角計算，否則 2x 匯出解析度下
 * 疊上去的字會因為 canvas 像素變多、字級數字沒變而顯得只有一半大。
 *
 * `labelBg`/`labelText` 由呼叫端傳入當下的外觀配色（`sceneColors.ts`），
 * 跟 `Dimensions.tsx` 互動畫面上 `Html` 標籤的顏色共用同一份表格——截圖
 * 合成的標註顏色必須跟按下截圖那一刻畫面上看到的顏色一致，深色外觀截深色
 * 底白字、淺色外觀截淺色底深字，不然淺色模式截出來的圖會出現一塊在畫面上
 * 看不到、只在截圖裡才有的深色底白字方塊，跟使用者剛剛在螢幕上看到的不符。
 */
async function composeDimensionLabels(
  rawBlob: Blob,
  placements: DimensionPlacementMap,
  camera: THREE.Camera,
  pixelRatio: number,
  scale: 1 | 2,
  labelBg: string,
  labelText: string,
): Promise<Blob> {
  const bitmap = await createImageBitmap(rawBlob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return rawBlob
  }
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const fontSizePx = labelFontSizePx(LABEL_BASE_FONT_PX, pixelRatio, scale)
  const paddingX = fontSizePx * 0.5
  const paddingY = fontSizePx * 0.35
  const radius = 4 * pixelRatio * scale

  ctx.font = `${fontSizePx}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const worldVector = new THREE.Vector3()
  for (const placement of Object.values(placements)) {
    for (const line of placement.lines) {
      const world = localLabelToWorld(line.labelPos, placement.position, placement.rotationY)
      worldVector.set(world[0], world[1], world[2]).project(camera)
      /**
       * z 超出 [-1, 1] 代表這個點在相機的近/遠截面之外（背後或太遠），不畫。
       *
       * 「相機背後的點不會被誤判成畫面內」這件事不是碰運氣測出來的，是標準
       * 透視投影矩陣的數學保證：Three.js 的相機看向 -Z，鏡頭前方的點在相機
       * 空間的 z（`view_z`）是負值；標準透視投影把 `view_z` 映射到 NDC z 的
       * 公式化簡後可以寫成 `ndc_z = (far+near)/(far-near) + [2·far·near/(far-near)] / view_z`。
       * 只要 `view_z > 0`（點在相機後方），等式右邊第二項恆為正（`far>near>0`
       * 時 `2·far·near/(far-near)` 是正常數），所以 `ndc_z` 必定嚴格大於
       * `(far+near)/(far-near)`——這個 app 的相機（Viewport.tsx）用
       * `near: 0.05, far: 200`，算出來下限約 `200.05/199.95 ≈ 1.0010`，
       * 永遠 > 1，一定會被下面這個檢查擋掉。
       *
       * 這個保證原本仰賴「near > 0 的標準透視相機」這個前提，寫這段註解時
       * 這裡的相機還只有透視一種。後來加上正交投影切換（`Viewport.tsx` 的
       * `orthographic`），重新推導過一次：Three.js 正交投影矩陣把
       * `view_z` 線性映射成 `ndc_z = -2/(far-near)·view_z - (far+near)/(far-near)`
       * （`OrthographicCamera.updateProjectionMatrix` 的 `te[10]`/`te[14]`），
       * 在 `view_z = 0`（相機所在平面）代入就已經等於 `-(far+near)/(far-near)`
       * ——跟透視公式的下限是同一個數值（這個 app 用 `near: 0.05, far: 200`，
       * 算出來約 `-1.0010`），且係數 `-2/(far-near)` 為負，`view_z` 越往正值
       * （越在相機後方）`ndc_z` 只會繼續往更負的方向掉，恆小於 -1。也就是說
       * 正交相機下「相機後方或比 near 更近的點」一樣會被下面這個 `z < -1`
       * 的檢查擋掉，只是映射公式從透視的倒數關係換成正交的線性關係，結論
       * 沒變。瀏覽器實測時也對正交模式截過圖確認標籤位置正確，沒有出現
       * 應該被濾掉、卻畫出來的錯位標籤（見 `toggles-report.md`）。
       */
      if (worldVector.z < -1 || worldVector.z > 1) continue
      const { x, y } = ndcToCanvasPixel(worldVector.x, worldVector.y, canvas.width, canvas.height)
      if (x < 0 || x > canvas.width || y < 0 || y > canvas.height) continue

      const text = `${line.labelCm} cm`
      const boxWidth = ctx.measureText(text).width + paddingX * 2
      const boxHeight = fontSizePx + paddingY * 2

      ctx.fillStyle = labelBg
      ctx.beginPath()
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, radius)
      } else {
        ctx.rect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight)
      }
      ctx.fill()

      ctx.fillStyle = labelText
      ctx.fillText(text, x, y)
    }
  }

  const composed = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
  return composed ?? rawBlob
}

/**
 * 掛在 Canvas 內部，把截圖能力註冊給外層介面（TopBar）使用。
 *
 * `preserveDrawingBuffer` 已在 Viewport.tsx 常開（WebGL context 建立時就
 * 決定的旗標，不能中途切換），所以這裡不用再像原本設計文件設想的「按下
 * 那一刻才臨時開」；但截圖仍然只在按下按鈕時才臨時放大 `pixelRatio` 重繪
 * 一次高解析度畫面，繪完立刻還原成畫面目前的解析度，互動時的每一幀渲染
 * 不受影響。
 */
export function useScreenshotBridge() {
  const { gl, scene, camera, size } = useThree()
  const setCapture = useScreenshotStore((s) => s.setCapture)

  useEffect(() => {
    const capture = async (scale: 1 | 2) => {
      // 重入防護（Task 22 review Finding 2 的 Minor 1）：快速連點兩個
      // 解析度選項時，如果讓第二次呼叫照樣往下執行，它會在畫面已經被
      // 第一次呼叫放大過的當下呼叫 `gl.getPixelRatio()`，把「放大後的
      // 值」誤記成「原本的值」，之後的還原就會把畫面卡在錯的解析度。
      // `TopBar` 也會讀這個旗標停用選單項目，這裡的檢查是最後一道防線。
      if (useScreenshotStore.getState().capturing) return
      useScreenshotStore.getState().setCapturing(true)

      const originalPixelRatio = gl.getPixelRatio()
      try {
        await waitForScreenshotPaint()
        gl.setPixelRatio(originalPixelRatio * scale)
        gl.setSize(size.width, size.height, false)
        gl.render(scene, camera)

        const rawBlob = await new Promise<Blob | null>((resolve) =>
          gl.domElement.toBlob((b) => resolve(b), 'image/png'),
        )
        if (!rawBlob) {
          throw new Error('截圖失敗：無法從畫面取得圖片內容（toBlob 回傳空值）')
        }

        const { dimensionMode } = useSceneStore.getState()
        const { placements } = useDimensionPlacementStore.getState()
        // 截圖要用「按下截圖那一刻」畫面上的外觀，不是永遠深色——跟
        // `Dimensions.tsx` 的 `Html` 標籤共用同一份 `SCENE_COLORS`。
        const { labelBg, labelText } = SCENE_COLORS[useAppearanceStore.getState().appearance]
        const finalBlob =
          dimensionMode !== 'off' && Object.keys(placements).length > 0
            ? await composeDimensionLabels(rawBlob, placements, camera, originalPixelRatio, scale, labelBg, labelText)
            : rawBlob

        const projectName = useSceneStore.getState().projectName
        downloadBlob(finalBlob, safeFileName(projectName, 'png'))
      } finally {
        // 不論成功或失敗（`gl.render` 丟出例外——例如 WebGL context 遺失、
        // 或 2x 解析度在大場景下配置 framebuffer 失敗；`toBlob`／
        // `composeDimensionLabels` 的 rejection）都要先把畫面還原回原本
        // 的解析度，這是 Task 22 review Finding 2 抓到的問題：原本這段
        // 還原邏輯寫在 `await` 之後、沒有 try/finally 包住，只要中途丟出
        // 例外，還原就永遠不會執行，渲染器會一直留在放大狀態，互動效能
        // 持續變差，直到使用者剛好再截一次圖或改變視窗大小才會「意外」
        // 復原。
        //
        // 內層再包一次 try/catch：如果連這段還原本身都失敗（例如 WebGL
        // context 真的已經遺失，`gl.render` 再叫一次還是會丟），沒有更好
        // 的處置方式，但至少不能讓「還原失敗」這個新例外蓋掉原始錯誤、
        // 或讓 `capturing` 卡在 true 導致往後永遠截不了圖。
        try {
          gl.setPixelRatio(originalPixelRatio)
          gl.setSize(size.width, size.height, false)
          gl.render(scene, camera)
        } catch {
          // 還原失敗，沒有更好的處置方式；不重新拋出，避免蓋掉原始錯誤。
        }
        useScreenshotStore.getState().setCapturing(false)
      }
    }

    setCapture(capture)
    return () => setCapture(null)
  }, [gl, scene, camera, size, setCapture])
}

/** 給 Canvas 內部使用的空元件。 */
export function ScreenshotBridge() {
  useScreenshotBridge()
  return null
}
