import { create } from 'zustand'

type State = { enabled: boolean; setEnabled: (v: boolean) => void }

/**
 * 高品質玻璃（transmission 折射）全域開關。
 * 預設關閉，因為 transmission 需要額外的場景重繪且明顯掉幀。
 */
export const useHighQualityGlass = create<State>((set) => ({
  enabled: false,
  setEnabled: (v) => set({ enabled: v }),
}))
