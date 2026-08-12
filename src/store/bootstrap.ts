import { useTextureStore } from '../materials/textureStore'

/**
 * 啟動時把 IndexedDB 裡既有的貼圖載回記憶體與 GPU 快取。
 *
 * 用模組層級呼叫（而不是丟在 React effect 裡）觸發：ES module 對同一個
 * 模組只會求值一次並快取結果，不論 `main.tsx` 或 `App.tsx` 誰先 import
 * 這個檔案，`loadAll()` 都只會被呼叫這一次，兩邊拿到的是同一個 Promise
 * ——不受 React.StrictMode 對 effect／render 重複呼叫的影響。
 *
 * `App.tsx` 的啟動流程（`loadSavedScene()` → 等這個 Promise → 清孤兒貼圖
 * `pruneOrphanedTextureAssets()`，見 Finding 5）依賴這裡匯出的 Promise 來
 * 知道「貼圖何時載完」，藉此保證清孤兒一定在貼圖與場景都就緒之後才跑。
 */
export const texturesReady: Promise<void> = useTextureStore.getState().loadAll()
