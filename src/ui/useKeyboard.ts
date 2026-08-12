import { useEffect } from 'react'
import { useSceneStore } from '../store/sceneStore'
import { emitCameraTransitionCancel } from '../scene/cameraPresets'

const ROTATE_STEP = (15 * Math.PI) / 180

/**
 * 這些 role 涵蓋 Radix 元件實際渲染出來的標籤，跟標籤名無關：
 * `Slider` thumb 是 `<span role="slider">`、`Select.Trigger` 是
 * `<button role="combobox">`、下拉選單內容是 `role="listbox"`/`role="option"`、
 * `Switch` 是 `<button role="switch">`、`SegmentedControl`（用
 * `ToggleGroup` 實作）的項目是 `role="radio"`。只認標籤名（INPUT/TEXTAREA/
 * SELECT）會漏掉這些——使用者拖完滑桿或選完下拉選單，焦點通常還留在
 * 那個控制項上，這時按 Delete/Q/E 這類快捷鍵不該被判定成「沒有在打字」
 * 而直接刪除/旋轉選取的物件。
 *
 * `menu`/`menuitem`/`menuitemcheckbox`/`menuitemradio`（Finding 2）：
 * `DropdownMenu.Content` 是 `role="menu"`、項目是 `role="menuitem"`。這是
 * 同一類缺陷第三次出現（Task 19 已經為 Slider 與 Select 修過一輪）——
 * `DropdownMenu` 自己的 `onKeyDown` 對 Delete/Backspace/Q/E 沒有
 * `stopPropagation`/`preventDefault`，會冒泡到 window，讓「截圖」這類下拉
 * 選單開著、又有選取物件時，按 Backspace 直接把物件刪掉。
 *
 * 這裡刻意**不**加 `role="tab"`（右欄尺寸／外觀分頁、左欄物件庫／場景清單
 * 分頁）：帳本記錄這是先前刻意排除的，要不要涵蓋需要另外跟 Kevin 確認
 * （分頁本身聚焦時按 Delete/Q/E 是否該被吞掉，取捨跟 menu 不同），這次
 * 最終審查範圍不含這項判斷，維持排除。
 */
const GUARDED_ROLES = [
  'slider', 'combobox', 'listbox', 'option', 'spinbutton', 'switch', 'radio', 'radiogroup',
  'menu', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
]
const GUARDED_ROLE_SELECTOR = GUARDED_ROLES.map((role) => `[role="${role}"]`).join(', ')

/** 在輸入框或這類可聚焦控制項上時不觸發快捷鍵。 */
function isTyping(target: EventTarget | null): boolean {
  // Vitest 的 Node 環境沒有 HTMLElement；鍵盤處理本身不依賴 DOM，讓這個
  // guard 在無 DOM 的單元測試與 SSR 探測也安全退回 false。
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true
  // 用 closest 而不是只看 target 本身：焦點可能落在控制項的子元素上
  // （例如 Select.Trigger 內部的文字/圖示節點）。
  return target.closest(GUARDED_ROLE_SELECTOR) !== null
}

/**
 * 處理 Escape 的共用入口。
 *
 * Escape 即使在 SegmentedControl／Slider 等可聚焦控制項上，也要先通知
 * CameraRig 中斷相機補間；控制項本身仍保留原本的行為，不在這裡清掉選取。
 * 回傳 true 代表呼叫端不應再繼續處理其他快捷鍵。
 */
export function handleEscapeKey(
  event: Pick<KeyboardEvent, 'key' | 'target'>,
  eventTarget: Pick<EventTarget, 'dispatchEvent'>,
  clearSelection: () => void,
): boolean {
  if (event.key !== 'Escape') return false
  emitCameraTransitionCancel(eventTarget)
  if (!isTyping(event.target)) clearSelection()
  return true
}

export function useKeyboard() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const store = useSceneStore.getState()
      if (handleEscapeKey(e, window, () => store.selectObject(null))) return
      if (isTyping(e.target)) return
      const id = store.selectedId
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) store.redo()
        else store.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (id) store.duplicateObject(id)
        return
      }
      if (!id) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        store.removeObject(id)
        return
      }
      if (e.key.toLowerCase() === 'q' || e.key.toLowerCase() === 'e') {
        const current = store.objects.find((o) => o.id === id)
        if (!current) return
        const sign = e.key.toLowerCase() === 'q' ? -1 : 1
        store.setTransform(id, { rotationY: current.transform.rotationY + sign * ROTATE_STEP })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
