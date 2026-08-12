let counter = 0

/**
 * 產生場景物件或貼圖資產的唯一 id。
 *
 * 帶一段亂數字尾（順帶項）：原本只有「時間戳記 + 每次載入頁面歸零的計數器」，
 * 兩個分頁（或同一分頁重新整理後）在同一毫秒內、計數器又剛好跑到同一個值
 * 時可能撞號。這原本只是「無害的重複識別碼」，但 `importProject` 已經把
 * 「同 id 即同內容」當成不變量在用（id 相同就完全跳過匯入，見
 * `projectFile.ts` 的說明）——一旦撞號，後果會從無害變成靜默用錯圖：使用者
 * 匯入的貼圖被當成「已存在」跳過，物件卻參照到一張完全不相干的圖。
 * `crypto.randomUUID()` 不一定在所有環境都有（例如非安全上下文），退回
 * `Math.random()` 字尾當 fallback。
 */
export function newId(prefix: string): string {
  counter += 1
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${random}`
}
