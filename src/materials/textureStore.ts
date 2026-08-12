import { create } from 'zustand'
import * as THREE from 'three'
import { newId } from '../lib/id'

export const MAX_TEXTURE_PX = 2048
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']

export type TextureAsset = {
  id: string
  name: string
  widthPx: number
  heightPx: number
  blob: Blob
}

/** 等比縮到長邊不超過 max，結果為至少 1 的整數。 */
export function fitWithinMax(w: number, h: number, max: number): { width: number; height: number } {
  const sw = Number.isFinite(w) && w > 0 ? w : 1
  const sh = Number.isFinite(h) && h > 0 ? h : 1
  const ratio = Math.min(1, max / Math.max(sw, sh))
  return {
    width: Math.max(1, Math.round(sw * ratio)),
    height: Math.max(1, Math.round(sh * ratio)),
  }
}

export function validateUpload(file: File): { ok: true } | { ok: false; reason: string } {
  if (!ACCEPTED.includes(file.type)) {
    return { ok: false, reason: '只支援圖片檔（PNG、JPG、WebP、GIF、AVIF）' }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: '檔案超過 20MB，請先壓縮再上傳' }
  }
  return { ok: true }
}

// IndexedDB

const DB_NAME = 'exhibit-studio'
const STORE = 'textures'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 開啟失敗'))
    req.onblocked = () => reject(new Error('IndexedDB 被其他分頁佔用，請關閉其他分頁後再試'))
  })
}

/**
 * 開連線、跑一段交易、保證連線一定會關閉（不論成功或失敗）。
 * `run` 對 store 發出的請求結果會在交易 complete 時回傳。
 */
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | undefined,
): Promise<T | undefined> {
  const db = await openDb()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = run(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req?.result)
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 交易失敗'))
    })
  } finally {
    db.close()
  }
}

async function idbPut(asset: TextureAsset): Promise<void> {
  await withStore('readwrite', (store) => store.put(asset))
}

async function idbGetAll(): Promise<TextureAsset[]> {
  const result = await withStore<TextureAsset[]>('readonly', (store) => store.getAll())
  return result ?? []
}

async function idbDelete(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id))
}

// 已建立的 Texture 快取，key 為 assetId

const textureCache = new Map<string, THREE.Texture>()

/**
 * dispose 一個 Texture 連同它背後的 `ImageBitmap`。
 *
 * three.js 的 `Texture.dispose()` 只釋放 GPU 端資源（觸發 WEBGL_lose_context
 * 事件讓渲染器刪掉對應的 GL 貼圖），不會呼叫 `ImageBitmap.close()`——
 * `CanvasTexture.image` 是解碼後常駐記憶體的點陣圖，`dispose()` 之後這份
 * CPU 端像素資料仍然要等 GC 才會回收。`close()` 立刻釋放它，不用等 GC。
 */
function disposeTexture(texture: THREE.Texture): void {
  texture.dispose()
  ;(texture.image as ImageBitmap | undefined)?.close?.()
}

/** 設定快取前，先 dispose 同一個 key 的舊 Texture，避免 GPU 資源洩漏。 */
function setCachedTexture(id: string, texture: THREE.Texture): void {
  const prev = textureCache.get(id)
  if (prev) disposeTexture(prev)
  textureCache.set(id, texture)
}

function makeTexture(bitmap: ImageBitmap): THREE.Texture {
  const tex = new THREE.CanvasTexture(bitmap)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

/**
 * 解碼成專門餵給 `makeTexture`／`CanvasTexture` 的 `ImageBitmap`，故意翻轉 Y 軸。
 *
 * 根因（瀏覽器實測抓到的真實 bug，不是理論疑慮）：`Texture.flipY` 預設是
 * `true`，這對來源是 `HTMLImageElement`／`HTMLCanvasElement` 的貼圖沒問題——
 * three.js 會用 `gl.pixelStorei(UNPACK_FLIP_Y_WEBGL, true)` 請 GPU 上傳時
 * 把資料上下反過來。但 WebGL 規格明文規定：texImage2D／texSubImage2D 的來源
 * 是 `ImageBitmap` 時，`UNPACK_FLIP_Y_WEBGL`（連同
 * `UNPACK_PREMULTIPLY_ALPHA_WEBGL`、`UNPACK_COLORSPACE_CONVERSION_WEBGL`）
 * 完全不生效——規格假設這些調整應該在 `createImageBitmap()` 當下用選項做掉，
 * 而不是留給上傳時的 pixel store 參數。
 *
 * `CanvasTexture` 的來源就是 `ImageBitmap`（見 `makeTexture` 的參數），`flipY`
 * 因此形同虛設：GPU 直接照 bitmap 解碼出來的列順序上傳，沒有任何翻轉。
 * `createImageBitmap()` 預設的 `imageOrientation` 不會翻轉列順序（跟一般
 * `<img>` 的自然像素順序一樣，第一列是圖片最上面那一列）。
 *
 * three.js 的 UV／幾何慣例（`PlaneGeometry`、`BoxGeometry` 每個面）都是
 * `v=1` 對應世界座標「上面」那一端，且是照著「`flipY=true` 生效」這個前提
 * 設計的：`v=1` 應該對應圖片「第一列」（圖片最上面）。一旦 `flipY` 對
 * `ImageBitmap` 沒有效果，圖片第一列（最上面）反而被直接放進 `v=0`
 * （幾何的「下面」），畫面上下顛倒——這正是本檔案上傳的貼圖在箱體任何面上
 * 都是上下顛倒的根本原因，不是箱體 UV 或 `computeTextureFit` 的問題（那兩者
 * 的座標數學驗證過是對的）。
 *
 * 修法：`createImageBitmap()` 的 `imageOrientation: 'flipY'` 選項會在解碼
 * 當下就把列順序反過來（相當於先把圖片上下鏡射再解碼）。因為 GPU
 * 上傳階段的 `UNPACK_FLIP_Y_WEBGL` 對 `ImageBitmap` 沒有作用，這裡預先做的
 * 反轉不會被再蓋掉一次，結果剛好等於「一般 `<img>` 搭配 `flipY=true`」的
 * 效果：圖片最上面一列會出現在 `v=1`，跟 `PlaneGeometry`／`BoxGeometry`
 * 的慣例對上，貼圖方向就正確了。
 *
 * 只用在這裡（`makeTexture` 的輸入），不要用在 `processFile` 內部量測尺寸／
 * 縮圖用的那個 `createImageBitmap(file)`：那個 bitmap 只是拿來讀
 * `width`/`height`，需要降階時還會被 `ctx.drawImage` 畫進 canvas 再輸出成
 * 新的 blob——`drawImage` 只是把 bitmap 的像素資料照樣畫上去，不會受
 * `imageOrientation` 選項影響「畫出來的圖看起來正不正」，如果那裡也翻轉，
 * 降階後存進 IndexedDB 的 blob 本身就會是顛倒的圖，之後不管有沒有套用這個
 * 修正都補救不回來。降階／不降階兩條路徑最終都會把 `asset.blob`
 * （原始檔或降階後重新編碼的檔）交給這個函式解碼一次，兩條路徑因此表現一致。
 */
export async function createTextureBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'flipY' })
}

/** 讀檔、降階到 2048、轉成 Blob 與尺寸。 */
async function processFile(file: File): Promise<{ blob: Blob; widthPx: number; heightPx: number }> {
  const source = await createImageBitmap(file)
  const { width, height } = fitWithinMax(source.width, source.height, MAX_TEXTURE_PX)
  if (width === source.width && height === source.height) {
    source.close()
    return { blob: file, widthPx: width, heightPx: height }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(source, 0, 0, width, height)
  source.close()
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/webp', 0.92),
  )
  return { blob, widthPx: width, heightPx: height }
}

type TextureState = {
  assets: Record<string, TextureAsset>
  /** IndexedDB 是否可用。無痕模式下為 false，降級為只存記憶體。 */
  storageAvailable: boolean
  addFromFile: (file: File) => Promise<string>
  getTexture: (assetId: string) => THREE.Texture | undefined
  putAsset: (asset: TextureAsset) => Promise<void>
  removeAsset: (id: string) => Promise<void>
  /** 載入啟動時 IndexedDB 既有資產，回傳本次從儲存層讀到的 id。 */
  loadAll: () => Promise<ReadonlySet<string>>
}

export const useTextureStore = create<TextureState>((set, get) => ({
  assets: {},
  storageAvailable: true,

  async addFromFile(file) {
    const check = validateUpload(file)
    if (!check.ok) {
      throw new Error(check.reason)
    }
    const { blob, widthPx, heightPx } = await processFile(file)
    const asset: TextureAsset = { id: newId('tex'), name: file.name, widthPx, heightPx, blob }
    await get().putAsset(asset)
    return asset.id
  },

  async putAsset(asset) {
    // 先建好 GPU 快取，再發佈 `assets` 狀態（順帶項）：`getTexture` 讀的是
    // 模組層級、非響應式的 `textureCache` Map，不是 zustand 狀態本身。
    // 如果先 `set()` 讓 `assets` 更新、貼圖卡在 await 建立 bitmap 的空窗期
    // 才建立快取，這段期間任何因 `assets` 變化而重繪的元件會讀到「asset
    // 已存在、但 getTexture 拿不到對應材質」，而且沒有第二次通知去讓它
    // 重繪一次補上——目前每個呼叫端都會 await 這個函式所以碰不到，但反過來
    // 做（快取先備妥）本質上更穩，不依賴呼叫端行為。
    const bitmap = await createTextureBitmap(asset.blob)
    setCachedTexture(asset.id, makeTexture(bitmap))
    set((s) => ({ assets: { ...s.assets, [asset.id]: asset } }))
    try {
      await idbPut(asset)
    } catch {
      set({ storageAvailable: false })
    }
  },

  getTexture(assetId) {
    return textureCache.get(assetId)
  },

  async removeAsset(id) {
    const prev = textureCache.get(id)
    if (prev) disposeTexture(prev)
    textureCache.delete(id)
    set((s) => {
      const next = { ...s.assets }
      delete next[id]
      return { assets: next }
    })
    try {
      await idbDelete(id)
    } catch {
      set({ storageAvailable: false })
    }
  },

  async loadAll() {
    let stored: TextureAsset[]
    try {
      stored = await idbGetAll()
    } catch {
      set({ storageAvailable: false })
      return new Set<string>()
    }
    const loadedIds = new Set(stored.map((asset) => asset.id))
    const assets: Record<string, TextureAsset> = {}
    for (const asset of stored) {
      assets[asset.id] = asset
      try {
        const texture = makeTexture(await createTextureBitmap(asset.blob))
        // `putAsset` 可能在這次 IDB 讀取尚未完成時先寫入同一個 id。若它
        // 已經發布了自己的快取，保留那份較新的 texture，避免 loadAll
        // 回來時把同期間的上傳結果蓋掉。
        if (!get().assets[asset.id] || !textureCache.has(asset.id)) {
          setCachedTexture(asset.id, texture)
        } else {
          disposeTexture(texture)
        }
      } catch {
        // 單一貼圖解碼失敗不影響其他貼圖
      }
    }
    // 使用目前 state 合併，而不是直接覆寫，保留 loadAll 等待期間由
    // `putAsset` 發布的新資產。新資產不會出現在 loadedIds，因此上層的
    // 啟動清理不會把尚未附加到 surface 的上傳誤判成孤兒。
    set((state) => ({ assets: { ...assets, ...state.assets } }))
    return loadedIds
  },
}))
