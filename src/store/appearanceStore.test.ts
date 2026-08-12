import { describe, it, expect, afterEach, vi } from 'vitest'

/**
 * `useAppearanceStore` 在模組載入當下就呼叫 `readStoredAppearance()` 決定
 * 初始值（見 `appearanceStore.ts` 的說明），所以這裡每個測試都要在
 * `import` 之前先用 `vi.stubGlobal('localStorage', ...)` 佈置好假的
 * `localStorage`，再用 `vi.resetModules()` + 動態 `import()` 拿到「這次
 * import 才第一次執行模組頂層程式碼」的乾淨實例，不能直接用靜態 import
 * ——那樣所有測試會共用同一份、在檔案最上面就已經初始化完畢的 singleton。
 */
function stubLocalStorage(initial: Record<string, string> = {}) {
  const backing = { ...initial }
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in backing ? backing[k] : null),
    setItem: (k: string, v: string) => {
      backing[k] = v
    },
    removeItem: (k: string) => {
      delete backing[k]
    },
  })
  return backing
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('useAppearanceStore', () => {
  it('沒有存過值時預設淺色', async () => {
    stubLocalStorage()
    const { useAppearanceStore } = await import('./appearanceStore')
    expect(useAppearanceStore.getState().appearance).toBe('light')
  })

  it('localStorage 裡存的是合法 dark 時，初始值仍讀回深色', async () => {
    stubLocalStorage({ 'exhibit-studio:appearance': 'dark' })
    const { useAppearanceStore } = await import('./appearanceStore')
    expect(useAppearanceStore.getState().appearance).toBe('dark')
  })

  it('localStorage 裡存的是 light 時，初始值讀回淺色', async () => {
    stubLocalStorage({ 'exhibit-studio:appearance': 'light' })
    const { useAppearanceStore } = await import('./appearanceStore')
    expect(useAppearanceStore.getState().appearance).toBe('light')
  })

  it('存的值不是合法的 light/dark 時，退回淺色（不是原樣沿用壞資料）', async () => {
    stubLocalStorage({ 'exhibit-studio:appearance': '這不是合法值' })
    const { useAppearanceStore } = await import('./appearanceStore')
    expect(useAppearanceStore.getState().appearance).toBe('light')
  })

  it('localStorage 完全不存在（例如私密瀏覽模式）時不拋錯，退回淺色', async () => {
    vi.stubGlobal('localStorage', undefined)
    const { useAppearanceStore } = await import('./appearanceStore')
    expect(useAppearanceStore.getState().appearance).toBe('light')
  })

  it('setAppearance 更新 state 並寫回 localStorage', async () => {
    const backing = stubLocalStorage()
    const { useAppearanceStore } = await import('./appearanceStore')
    useAppearanceStore.getState().setAppearance('light')
    expect(useAppearanceStore.getState().appearance).toBe('light')
    expect(backing['exhibit-studio:appearance']).toBe('light')
  })

  it('toggleAppearance 從預設淺色切到深色再切回淺色', async () => {
    stubLocalStorage()
    const { useAppearanceStore } = await import('./appearanceStore')
    expect(useAppearanceStore.getState().appearance).toBe('light')
    useAppearanceStore.getState().toggleAppearance()
    expect(useAppearanceStore.getState().appearance).toBe('dark')
    useAppearanceStore.getState().toggleAppearance()
    expect(useAppearanceStore.getState().appearance).toBe('light')
  })

  it('寫入失敗（例如配額不足）不拋錯，state 仍然照常更新', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    })
    const { useAppearanceStore } = await import('./appearanceStore')
    expect(() => useAppearanceStore.getState().setAppearance('light')).not.toThrow()
    expect(useAppearanceStore.getState().appearance).toBe('light')
  })
})
