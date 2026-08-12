import { create } from 'zustand'
import type { DimensionLine } from './dimensionMath'

/**
 * `Dimensions.tsx` 目前算出來的標註線（本地座標，見 `dimensionMath.ts`）
 * 與所在物件的 transform。截圖功能（`useScreenshot.ts`）需要在擷取畫面
 * 那一刻讀出「現在螢幕上到底有沒有標註、標註線長什麼樣子」，但它不是
 * React 元件、不該訂閱 `Dimensions` 的內部 state——所以由 `Dimensions`
 * 把算好的結果鏡射一份到這個獨立的 zustand store，截圖時只用
 * `getState()` 讀一次快照，不建立訂閱、不影響任一方的渲染時機。
 *
 * 「全部物件」模式加入之後，同一時間可能有多個物件各自顯示標註，所以這裡
 * 從單一 `DimensionPlacement` 改成用物件 id 當 key 的 map（`DimensionPlacementMap`）
 * ——`Dimensions.tsx` 對每個物件各自呼叫 `setPlacement(id, ...)`／
 * `removePlacement(id)`，截圖合成（`composeDimensionLabels`）則走訪整個
 * map，把每一個物件的標籤都疊上去。
 */
export type DimensionPlacement = {
  lines: DimensionLine[]
  position: [number, number, number]
  rotationY: number
}

export type DimensionPlacementMap = Record<string, DimensionPlacement>

type DimensionPlacementState = {
  placements: DimensionPlacementMap
  setPlacement: (id: string, p: DimensionPlacement) => void
  /** 移除單一物件的標註（物件被刪除/隱藏/取消選取，或標註模式不再涵蓋它）。 */
  removePlacement: (id: string) => void
  /** 清空所有標註（標註模式切成 `'off'` 時呼叫）。 */
  clearPlacements: () => void
}

export const useDimensionPlacementStore = create<DimensionPlacementState>((set) => ({
  placements: {},
  setPlacement: (id, p) => set((s) => ({ placements: { ...s.placements, [id]: p } })),
  removePlacement: (id) =>
    set((s) => {
      // 不存在就完全不動：回傳空物件讓 zustand 的 merge 不改變 `placements`
      // 的參考，訂閱 `s.placements` 的元件（Dimensions 的渲染）不會被觸發
      // 多餘的重新渲染。
      if (!(id in s.placements)) return {}
      const next = { ...s.placements }
      delete next[id]
      return { placements: next }
    }),
  clearPlacements: () =>
    set((s) => (Object.keys(s.placements).length === 0 ? {} : { placements: {} })),
}))
