import { create } from 'zustand'

export type Appearance = 'dark' | 'light'

const STORAGE_KEY = 'exhibit-studio:appearance'

/**
 * 深色／淺色是介面偏好，不是場景資料：不進復原歷史（比照 `cameraPreset`／
 * `projection`），也不進專案檔（比照 `useHighQualityGlass`）——換一台電腦
 * 開同一份專案檔，不該把原本那台電腦的外觀偏好也一起帶過去。
 *
 * 存 localStorage，但用專屬的 key，跟 `persistence.ts` 的場景存檔 key
 * （`exhibit-studio:scene`）分開，兩者的生命週期完全獨立：清空場景、
 * 匯入專案檔都不該動到這個值；反過來，切換外觀也不該被場景的存檔/還原
 * 邏輯牽動。
 */
export function readStoredAppearance(): Appearance {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'dark' || stored === 'light' ? stored : 'light'
  } catch {
    // 私密瀏覽模式、儲存被封鎖，或（測試環境）根本沒有 `localStorage`
    // 這個全域物件：都退回預設淺色，不讓外觀偏好的讀取變成一個會炸掉
    // 整個 app 啟動的例外來源。
    return 'light'
  }
}

function writeStoredAppearance(v: Appearance): void {
  try {
    localStorage.setItem(STORAGE_KEY, v)
  } catch {
    // 寫入失敗（配額或私密模式）：這個 session 裡外觀仍然會照常切換，
    // 只是重新整理後記不住，不影響當下操作。
  }
}

type AppearanceState = {
  appearance: Appearance
  setAppearance: (v: Appearance) => void
  toggleAppearance: () => void
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  appearance: readStoredAppearance(),
  setAppearance(v) {
    writeStoredAppearance(v)
    set({ appearance: v })
  },
  toggleAppearance() {
    const next: Appearance = get().appearance === 'dark' ? 'light' : 'dark'
    writeStoredAppearance(next)
    set({ appearance: next })
  },
}))
