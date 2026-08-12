/**
 * 多物件尺寸標註（`Dimensions.tsx`「全部物件」模式）的每物件髒檢查。
 *
 * 「選取物件」模式原本只需要記住單一個字串 key（見 `Dimensions.tsx` 舊版的
 * `prevKeyRef`）；改成多物件之後，如果每幀都對整個 `objects` 陣列做一次
 * `JSON.stringify` 比對，拖曳其中一個物件會讓另外九個也一起被判定為
 * 「可能變了」而重新 `measureLocalBounds`（那是一次 mesh 走訪，比字串
 * 比對貴得多）。這個類別讓每個物件各自記住自己上一次觸發量測時的 key，
 * 只有真的變動的那個 id 需要重新量測，其餘的直接短路跳過。
 *
 * 刻意跟 React/Three.js 完全脫鉤（不碰 store、不碰 scene graph），只做
 * 「記住 + 比較」這件事本身，方便獨立測試（`dimensionDirtyTracker.test.ts`），
 * 也讓 `Dimensions.tsx` 裡的 `useFrame` 回呼專心處理量測與渲染，不用另外
 * 為了測試而拆解 Map 操作的細節。
 */
export class DimensionDirtyTracker {
  private keys = new Map<string, string>()

  /**
   * 這個 id 的 key 是否跟上次記錄的不同。不同（含第一次呼叫）就記錄新 key
   * 並回傳 `true`；相同就直接回傳 `false`，呼叫端應該跳過重新量測。
   */
  isDirty(id: string, key: string): boolean {
    if (this.keys.get(id) === key) return false
    this.keys.set(id, key)
    return true
  }

  /** 停止追蹤這個 id（物件被刪除、隱藏、取消選取，或標註模式切換離開它時呼叫）。 */
  forget(id: string): void {
    this.keys.delete(id)
  }

  /** 目前正在追蹤中的所有 id（用來找出「這一幀不再需要標註」的孤兒）。 */
  trackedIds(): string[] {
    return [...this.keys.keys()]
  }

  /** 清空全部追蹤紀錄（標註模式切成 `'off'` 時呼叫）。 */
  clear(): void {
    this.keys.clear()
  }
}
