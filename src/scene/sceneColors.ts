import type { Appearance } from '../store/appearanceStore'

export type SceneColorSet = {
  /** `<Canvas>` 的 CSS 背景色。 */
  background: string
  /** `GroundGrid` 的細格線（每 10 公分）。 */
  gridCell: string
  /** `GroundGrid` 的粗格線（每 1 公尺）。 */
  gridSection: string
  /** 選取外框（`ObjectNode.tsx` 的 `SelectionOutline`）。 */
  selectionOutline: string
  /** 尺寸標註線（`Dimensions.tsx` 的 `Line`）。 */
  dimensionLine: string
  /** 尺寸標註公分數字的底色，CSS/canvas 都吃 rgba() 字串。互動畫面
   *  （`Dimensions.tsx` 的 `Html`）與截圖合成（`useScreenshot.ts` 的
   *  `composeDimensionLabels`）共用同一份，兩者的視覺才不會不一致。 */
  labelBg: string
  /** 尺寸標註公分數字的文字色，同上，兩處共用。 */
  labelText: string
}

/**
 * 深色／淺色兩套場景配色，供 `GroundGrid`／`Viewport`／`ObjectNode`／
 * `Dimensions`／`useScreenshot` 共用，避免同一組顏色語意（例如「標註底色」）
 * 在多個檔案各自寫一份、之後只改了其中一處造成畫面跟截圖顏色對不上。
 *
 * 深色那組是原本就有的寫死值（`#1a1d21` 等），這裡只是把它們搬進一個
 * 共用表格，不改變既有的深色外觀。
 */
export const SCENE_COLORS: Record<Appearance, SceneColorSet> = {
  dark: {
    background: '#1a1d21',
    gridCell: '#3a3f45',
    gridSection: '#5d646c',
    selectionOutline: '#ffffff',
    dimensionLine: '#ffffff',
    labelBg: 'rgba(20, 22, 25, 0.85)',
    labelText: '#ffffff',
  },
  light: {
    background: '#e4e7eb',
    gridCell: '#c3c8cd',
    gridSection: '#8a9099',
    selectionOutline: '#1a1d21',
    dimensionLine: '#1a1d21',
    labelBg: 'rgba(255, 255, 255, 0.9)',
    labelText: '#1a1d21',
  },
}
