import { deserializeScene, SCENE_VERSION } from './persistence'
import { useSceneStore } from './sceneStore'
import { useTextureStore, type TextureAsset } from '../materials/textureStore'
import { downloadBlob, safeFileName } from '../lib/download'
import type { SceneObject } from '../objects/types'

export const PROJECT_VERSION = 1

export type ProjectAsset = {
  id: string
  name: string
  widthPx: number
  heightPx: number
  /** base64 內嵌，讓專案檔是單一可傳遞的檔案。 */
  dataUrl: string
}

type ParseResult =
  | { objects: SceneObject[]; projectName: string; assets: ProjectAsset[] }
  | { error: string }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('讀取失敗'))
    reader.readAsDataURL(blob)
  })
}

/**
 * 專案檔是設計來在使用者之間傳遞的檔案，`dataUrl` 因此是不可信輸入。
 * `parseProjectFile` 已經把關過一次（只留下 `data:image/` 開頭的字串），
 * 這裡再做一次防禦性檢查：即使有呼叫者繞過 `parseProjectFile` 直接呼叫
 * 這個函式、或未來 `ProjectAsset` 的產生路徑變了，也不會對呼叫端傳進來的
 * 任意網址發出網路請求（IP、referrer 外洩風險），也不會卡在一個不回應
 * 的外部伺服器上（`fetch` 沒有逾時）。
 */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('不是合法的圖片資料')
  }
  const response = await fetch(dataUrl)
  return response.blob()
}

export function parseProjectFile(rawText: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return { error: '這個檔案不是合法的專案檔' }
  }
  if (!isRecord(parsed)) return { error: '這個檔案不是合法的專案檔' }
  if (parsed.version !== PROJECT_VERSION) {
    return { error: `專案檔版本不符（檔案為 ${String(parsed.version)}，目前支援 ${PROJECT_VERSION}）` }
  }
  if (!Array.isArray(parsed.objects)) return { error: '專案檔缺少物件資料' }

  // 物件本身重用場景存檔的對帳邏輯，補回缺少的參數與面
  const scene = deserializeScene(
    JSON.stringify({
      version: SCENE_VERSION,
      projectName: parsed.projectName,
      objects: parsed.objects,
    }),
  )
  if (!scene) return { error: '專案檔的物件資料無法讀取' }

  const assets: ProjectAsset[] = Array.isArray(parsed.assets)
    ? parsed.assets.filter(
        (a): a is ProjectAsset =>
          isRecord(a) &&
          typeof a.id === 'string' &&
          typeof a.name === 'string' &&
          typeof a.widthPx === 'number' &&
          typeof a.heightPx === 'number' &&
          typeof a.dataUrl === 'string' &&
          // 專案檔會在使用者之間傳遞，dataUrl 因此是不可信輸入：只接受
          // data:image/ 開頭的內嵌圖片，擋掉外部網址（避免匯入時對任意
          // 網址發出網路請求，外洩 IP／referrer，也避免 fetch 無逾時卡住）
          // 與非圖片的 data URI。不符合的 asset 當成欄位殘缺一併濾掉。
          a.dataUrl.startsWith('data:image/'),
      )
    : []

  return { objects: scene.objects, projectName: scene.projectName, assets }
}

export async function exportProject(): Promise<void> {
  const { objects, projectName } = useSceneStore.getState()
  const stored = useTextureStore.getState().assets

  // 只匯出場景實際用到的貼圖。這裡刻意不過濾 `visible`/`locked`：
  // 隱藏中的物件仍然是場景的一部分，重新打開匯出檔時應該連同它的貼圖
  // 一起恢復，不能因為使用者暫時關掉可見度就把貼圖漏掉。
  const usedIds = new Set<string>()
  for (const o of objects) {
    for (const surface of Object.values(o.surfaces)) {
      if (surface.texture) usedIds.add(surface.texture.assetId)
    }
  }

  const assets: ProjectAsset[] = []
  for (const id of usedIds) {
    const asset = stored[id]
    if (!asset) continue
    assets.push({
      id: asset.id,
      name: asset.name,
      widthPx: asset.widthPx,
      heightPx: asset.heightPx,
      dataUrl: await blobToDataUrl(asset.blob),
    })
  }

  const payload = JSON.stringify({ version: PROJECT_VERSION, projectName, objects, assets })
  downloadBlob(new Blob([payload], { type: 'application/json' }), safeFileName(projectName, 'json'))
}

/**
 * 成功回傳 null，失敗回傳錯誤訊息。失敗時不動現有場景（硬規則）。
 *
 * 順序刻意是「貼圖先進 store，最後才 replaceScene」：`SurfaceMaterial`
 * 是依 `surfaces[id].texture.assetId` 去 `useTextureStore` 查貼圖，如果
 * 反過來先換場景、貼圖才進 store，畫面會先閃過一輪「貼圖還沒到」的純色，
 * 才補上正確的圖。
 *
 * 這個順序看起來有「貼圖進去了、場景還沒換」的中繼狀態，但因為：
 * 1. `parseProjectFile` 已經在迴圈開始前就驗證過整包物件資料，物件本身
 *    的失敗不會發生在這裡；
 * 2. 迴圈裡每一張貼圖的還原都各自包在自己的 try/catch 裡，單張失敗只會
 *    讓那一面退回純色，不會讓整個迴圈拋出，`replaceScene` 一定會執行到；
 * 所以不會出現「使用者中途看到錯誤訊息、但場景已經被貼圖污染」的狀態——
 * 迴圈跑完之後，成功匯入的貼圖與最終場景一定是同一份 result 產生的，
 * 是一致的。
 *
 * **不覆寫、不刪除已經存在的資產（id 碰撞的處理）**：`ProjectAsset.id`
 * 是上傳當下由 `newId()` 產生、匯出時原封不動帶著走的識別碼，匯入時也
 * 不會重新產生。專案檔的用途是在使用者之間傳遞，兩份檔案（或使用者自己
 * 手上的場景）的資產 id 剛好相同是可能發生的（同一台電腦先前匯出的檔案
 * 被再次匯入、或同事傳來的檔案剛好撞到本機既有的 id）。
 *
 * 如果對每個 asset 都無條件嘗試 `putAsset` 再視失敗與否決定要不要
 * `removeAsset`，會有一條真正會咬人的路徑：使用者手上已經有一張好的
 * `tex_x` 正貼在場景某個物件上，匯入的檔案裡剛好也有 id 為 `tex_x` 的
 * asset、但那筆的 `dataUrl` 是壞的——`dataUrlToBlob` 會在 `putAsset` 被
 * 呼叫之前就 throw，原本那張好的資產完全沒被寫入路徑碰到，但 catch 裡
 * 呼叫 `removeAsset('tex_x')` 卻會把它從記憶體與 IndexedDB 一起靜默刪掉。
 *
 * 這裡選擇「匯入前用 `useTextureStore.getState().assets[id]` 檢查 id 是否
 * 已經存在，存在就完全跳過（不呼叫 `putAsset`，也不會進到失敗分支去呼叫
 * `removeAsset`）」，而不是「迴圈開始前snapshot 一份既有 id 集合、`catch`
 * 裡只對不在集合裡的 id 呼叫 `removeAsset`」，原因：
 * 1. 兩者都能避免誤刪使用者原本就有的資產，但「跳過」多一層好處——
 *    同一個 id 假設代表同一張圖（id 是隨機識別碼、不是內容雜湊，這個假設
 *    本來就是這個系統其他地方依賴的前提，例如 `surfaces[id].texture.assetId`
 *    的參照穩定性），已經存在就不需要重新解碼、重新寫入 IndexedDB，省下
 *    不必要的工。
 * 2. 用 `getState()` 即時查（而不是迴圈開始前的靜態 snapshot），同一個
 *    匯入檔案裡如果剛好有重複 id 的 asset 條目（手動編輯過的殘缺檔案），
 *    第二筆會看到第一筆已經寫入而跳過，不會重複解碼兩次。
 *
 * 唯一真正的殘留風險，因此縮小到「這次匯入寫進去的全新 id，且它自己
 * 解碼失敗」：`putAsset` 內部**先**用 `createTextureBitmap` 建好 GPU 快取，
 * 成功之後才 `set()` 把 asset 發佈進 store 的 `assets`（見
 * `textureStore.ts` 的 `putAsset`）。所以解碼失敗時 `assets` 根本沒被寫入，
 * 下面 catch 裡呼叫的 `removeAsset(asset.id)` 現在是無害的 no-op（目標
 * id 本來就不存在），而不是清掉一個「已經半殘留在 assets 裡」的項目。
 * 保留這次呼叫是為了雙重保險：`removeAsset` 同時也會嘗試清 IndexedDB，
 * 萬一未來 `putAsset` 的寫入順序又被調整，這裡不用跟著改。
 */
export async function importProject(file: File): Promise<string | null> {
  let rawText: string
  try {
    rawText = await file.text()
  } catch {
    return '讀取檔案失敗，再試一次'
  }

  const result = parseProjectFile(rawText)
  if ('error' in result) return result.error

  const { putAsset, removeAsset } = useTextureStore.getState()
  for (const asset of result.assets) {
    // id 已經存在就完全不動它：同一個 id 視為同一張圖，避免匯入的壞資料
    // 覆寫或（透過下面的失敗清理）誤刪使用者原本就有的貼圖。
    if (useTextureStore.getState().assets[asset.id]) continue

    try {
      const blob = await dataUrlToBlob(asset.dataUrl)
      const restored: TextureAsset = {
        id: asset.id,
        name: asset.name,
        widthPx: asset.widthPx,
        heightPx: asset.heightPx,
        blob,
      }
      await putAsset(restored)
    } catch {
      // 單張貼圖還原失敗不擋整個匯入，該面會退回純色。
      // 這個 id 上面已經確認過「匯入前不存在」，所以這裡清掉的一定是
      // putAsset 這次嘗試寫入、失敗的半殘狀態，不會誤刪原本就有的資產。
      await removeAsset(asset.id)
    }
  }

  useSceneStore.getState().replaceScene(result.objects, result.projectName)
  return null
}
