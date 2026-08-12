import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'

/**
 * 數字輸入框「本地草稿 + 失焦或 Enter 才提交」的共用邏輯。
 *
 * `ParamField` 的滑桿旁數字欄位與 `TransformFields` 的位置/角度欄位原本
 * 各自維護一份幾乎一樣的邏輯，抽成這個 hook 避免以後兩邊各自演化到不
 * 一致（例如只有一邊補了 Escape 取消，見下方）。
 *
 * 行為比照 `ObjectListRow` 的改名欄位（Task 14 的教訓：打字過程直接呼叫
 * 會 commit 進復原歷史的 store 動作，會讓輸入一個三位數的值就推三筆
 * 歷史）：
 * - 打字只改本地 `draft`，不呼叫 `onCommit`，過程中畫面不會被牽動。
 * - 失焦或按 Enter：把 `draft` 解析成數字後呼叫 `onCommit`；解析失敗
 *   （空字串、非數字）不提交，直接還原顯示成目前的 `value`。
 * - 按 Escape：捨棄 `draft`，還原成目前的 `value` 並失焦，不提交——跟
 *   `ObjectListRow` 用同一套 `cancelledRef` 手法，避免 Escape 觸發的
 *   `blur()` 又被 `onBlur` 的提交邏輯當成一次真正的提交。
 * - `value` 外部變動時（undo/redo、`sideEffect` 連動、滑桿拖曳中的即時
 *   更新）只在「沒有編輯中」時同步進 `draft`，避免蓋掉使用者正在打的字。
 */
export function useBufferedNumberInput(value: number, onCommit: (next: number) => void) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  /** Escape 放棄編輯時設為 true，讓隨之而來的 blur 事件不要重新提交。 */
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!editing) setDraft(String(value))
  }, [value, editing])

  function commit() {
    if (cancelledRef.current) {
      cancelledRef.current = false
      setDraft(String(value))
      setEditing(false)
      return
    }
    const parsed = Number(draft)
    // 只在解析出來的值真的跟目前值不同才呼叫 onCommit——聚焦後什麼都沒打
    // 就失焦（draft 從沒被 onChange 動過，等於目前的 value）是最常見的情況，
    // 每次都無條件呼叫 onCommit 會讓「只是點一下欄位」也推一筆復原歷史、
    // 清空 redo 堆疊（Finding 1）。sceneStore.commit() 也有一層同樣的變更
    // 偵測，這裡先擋掉是為了在源頭就避免無意義的 store 呼叫。
    if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed)
    setEditing(false)
  }

  return {
    /** 綁定到 `TextField.Root` 的 `value`：編輯中顯示本地草稿，否則顯示 store 的值。 */
    displayValue: editing ? draft : String(value),
    inputProps: {
      onFocus: () => setEditing(true),
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        setEditing(true)
        setDraft(e.target.value)
      },
      onBlur: commit,
      onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          cancelledRef.current = true
          e.currentTarget.blur()
        }
      },
    },
  }
}
