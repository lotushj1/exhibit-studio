import { useTextureStore } from '../materials/textureStore'

/**
 * 啟動時把 IndexedDB 裡既有的貼圖載回記憶體與 GPU 快取。
 *
 * 用模組層級呼叫（而不是丟在 React effect 裡）觸發：ES module 對同一個
 * 模組只會求值一次並快取結果，不論 `main.tsx` 或 `App.tsx` 誰先 import
 * 這個檔案，`loadAll()` 都只會被呼叫這一次，兩邊拿到的是同一個 Promise
 * ——不受 React.StrictMode 對 effect／render 重複呼叫的影響。
 *
 * `App.tsx` 以這個 Promise 等待貼圖載入完成，再依場景還原與儲存層狀態
 * 決定是否清理啟動時既有的孤兒資產。Promise 的結果只包含這次從 IndexedDB
 * 讀到的 id，不包含等待期間由使用者新上傳的資產，讓清理不會誤刪未附加的圖。
 */
export const texturesReady: Promise<ReadonlySet<string>> = useTextureStore.getState().loadAll()
