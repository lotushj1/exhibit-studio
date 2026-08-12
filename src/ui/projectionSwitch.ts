/** 投影 Canvas 重建期間給使用者的短暫狀態提示。 */
export const PROJECTION_SWITCH_MESSAGE = '切換投影中…'

/**
 * 兩個 requestAnimationFrame 只保證新 renderer 至少走過一輪 paint；在
 * 真實頁面上仍可能短到肉眼與輔助科技都捕捉不到。因此提示額外維持一個
 * 保守的最短可見時間，讓切換中的狀態有穩定的回饋窗口。
 */
export const PROJECTION_SWITCH_MIN_VISIBLE_MS = 300

export function projectionSwitchLabel(transitioning: boolean): string | null {
  return transitioning ? PROJECTION_SWITCH_MESSAGE : null
}

/** 回傳距離最短可見時間還需要等待的毫秒數。 */
export function projectionSwitchRemainingMs(startedAt: number, now: number): number {
  return Math.max(0, PROJECTION_SWITCH_MIN_VISIBLE_MS - Math.max(0, now - startedAt))
}
