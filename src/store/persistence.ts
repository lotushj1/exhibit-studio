import { useSceneStore } from './sceneStore'
import { REGISTRY, createObject, getDef } from '../objects/registry'
import { coerceParam } from '../objects/paramCoerce'
import { FINISHES } from '../materials/finishes'
import type { FitMode, Rotation } from '../materials/textureFit'
import type { ObjectKind, SceneObject } from '../objects/types'
import { useTextureStore } from '../materials/textureStore'

export const SCENE_STORAGE_KEY = 'exhibit-studio:scene'
export const SCENE_VERSION = 1

export function serializeScene(objects: SceneObject[], projectName: string): string {
  return JSON.stringify({ version: SCENE_VERSION, projectName, objects })
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const VALID_FITS: FitMode[] = ['cover', 'contain', 'repeat']
const VALID_ROTATIONS: Rotation[] = [0, 90, 180, 270]

/**
 * 驗證存檔／專案檔裡的 texture 子物件（Finding 4）。專案檔是設計來在使用者
 * 之間傳遞的不可信輸入，原本的 `isRecord(stored.texture)` 只確認是個物件，
 * 任何形狀都會通過：`fit` 塞一個 schema 沒有的字串、`rotation` 塞 45（介面
 * 的旋轉按鈕永遠是 `(r + 90) % 360`，從 45 出發永遠轉不回 0）、`offset` 塞
 * 字串陣列（`computeTextureFit` 會把它原樣加進去，產生 `NaN` 讓貼圖整個
 * 消失）都能通過舊檢查。
 *
 * 任一欄不合法就整個 texture 丟掉，退回純色——這是既有的優雅降級路徑
 * （`SurfaceMaterial` 在拿不到材質時本來就會退回純色），不需要為了保留半殘
 * 的 texture 資料另外設計一條路徑。
 */
function coerceTexture(stored: unknown): SceneObject['surfaces'][string]['texture'] {
  if (!isRecord(stored)) return undefined
  const { assetId, fit, rotation, scale, offset, unlit } = stored
  if (typeof assetId !== 'string' || assetId === '') return undefined
  if (typeof fit !== 'string' || !VALID_FITS.includes(fit as FitMode)) return undefined
  if (typeof rotation !== 'number' || !VALID_ROTATIONS.includes(rotation as Rotation)) return undefined
  if (typeof scale !== 'number' || !Number.isFinite(scale)) return undefined
  if (
    !Array.isArray(offset) ||
    offset.length !== 2 ||
    !offset.every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    return undefined
  }
  // `unlit` 是後來才加的欄位。舊存檔沒有它，缺少時當 false（維持原本的受光
  // 行為）；有但型別不對就整個 texture 丟掉，跟其他欄位一致，不要放行一個
  // 半信半疑的記錄進場景。
  if (unlit !== undefined && typeof unlit !== 'boolean') return undefined
  return {
    assetId,
    fit: fit as FitMode,
    rotation: rotation as Rotation,
    scale,
    offset: offset as [number, number],
    unlit: unlit === true,
  }
}

/**
 * 把存下來的物件對回目前的 schema：
 * 缺少的參數與面用預設值補回，已移除的參數丟掉。
 * 這讓舊存檔在物件定義改過之後仍然開得起來。
 */
function reconcile(raw: unknown): SceneObject | null {
  if (!isRecord(raw)) return null
  const kind = raw.kind
  if (typeof kind !== 'string' || !(kind in REGISTRY)) return null
  if (typeof raw.id !== 'string') return null
  if (!isRecord(raw.params) || !isRecord(raw.transform)) return null

  const def = getDef(kind as ObjectKind)
  const fresh = createObject(kind as ObjectKind)

  const params = { ...fresh.params }
  for (const p of def.schema) {
    const stored = (raw.params as Record<string, unknown>)[p.key]
    if (stored === undefined) continue
    // 跟 `sceneStore.applyParam` 共用同一份 `coerceParam`（Finding 3）：
    // 不只檢查型別，數字還會夾在 schema 的 min/max 之間，且會擋掉 `NaN`
    // （`typeof NaN === 'number'`，只檢查 typeof 的舊邏輯會讓它通過）。
    // 存檔裡的 `openShelf.heightCm` 被手改成 30（schema 規定 ≥ 60）這種
    // 情況，coerceParam 會回傳 60，不合法時回傳 undefined、保留 fresh 的
    // 預設值，兩種結果都跟面板顯示與實際渲染一致。
    const coerced = coerceParam(p, stored)
    if (coerced !== undefined) params[p.key] = coerced
  }

  const surfaces = { ...fresh.surfaces }
  if (isRecord(raw.surfaces)) {
    for (const s of def.surfaces) {
      const stored = (raw.surfaces as Record<string, unknown>)[s.id]
      if (isRecord(stored) && typeof stored.finish === 'string' && typeof stored.color === 'string') {
        const candidate = stored.finish as SceneObject['surfaces'][string]['finish']
        surfaces[s.id] = {
          // 存檔裡的材質可能已被移除，這時保留目前的預設值
          finish: candidate in FINISHES ? candidate : surfaces[s.id].finish,
          color: stored.color,
          texture: coerceTexture(stored.texture),
        }
      }
    }
  }

  const position = (raw.transform as Record<string, unknown>).position
  const rotationY = (raw.transform as Record<string, unknown>).rotationY

  return {
    id: raw.id,
    kind: kind as ObjectKind,
    name: typeof raw.name === 'string' ? raw.name : def.label,
    params,
    transform: {
      position: Array.isArray(position) && position.length === 3 && position.every((n) => typeof n === 'number')
        ? (position as [number, number, number])
        : [...fresh.transform.position],
      rotationY: typeof rotationY === 'number' ? rotationY : 0,
    },
    surfaces,
    visible: raw.visible !== false,
    locked: raw.locked === true,
  }
}

export function deserializeScene(rawText: string): { objects: SceneObject[]; projectName: string } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  if (parsed.version !== SCENE_VERSION) return null
  if (!Array.isArray(parsed.objects)) return null

  return {
    projectName: typeof parsed.projectName === 'string' ? parsed.projectName : '未命名專案',
    objects: parsed.objects.map(reconcile).filter((o): o is SceneObject => o !== null),
  }
}

/**
 * 清掉沒有被任何面參照的貼圖資產（Finding 5）：目前介面上「移除貼圖」只
 * 把 `surfaces[id].texture` 設成 `undefined`，資產本身仍留在 `assets`／
 * `textureCache`／IndexedDB 裡，永遠不會被回收，開機時 `loadAll()` 又會把
 * 每一筆都解碼成 `ImageBitmap`，長期使用下開機時間與記憶體隨「歷來上傳
 * 總量」而非目前場景大小成長。
 *
 * **只能在開機時呼叫一次**，且必須在場景**確實從存檔還原成功**
 * （`loadSavedScene()` 回傳 `true`）之後才能呼叫（Residual 1）：呼叫端
 * 沒有分辨「還原成功」與「還原失敗（存檔壞掉／版本不符／沒有存檔）」
 * 兩種情況時，`usedIds` 在失敗時會是空集合，這裡的迴圈會把所有資產都
 * 當孤兒清掉，造成不可逆的資料遺失。呼叫端見 `App.tsx`。
 * 編輯過程中不能呼叫——使用者刪除貼圖後可能按 Cmd+Z 復原，這時 asset 已經
 * 沒有任何 surface 參照它，但復原需要它還在；只在開機時掃一次，把成長限制
 * 在單一 session 內，同時不會誤刪「剛被移除、還沒存檔的」貼圖背後的復原
 * 需求。
 */
export function pruneOrphanedTextureAssets(): void {
  const usedIds = new Set<string>()
  for (const object of useSceneStore.getState().objects) {
    for (const surface of Object.values(object.surfaces)) {
      if (surface.texture) usedIds.add(surface.texture.assetId)
    }
  }
  const { assets, removeAsset } = useTextureStore.getState()
  for (const id of Object.keys(assets)) {
    if (!usedIds.has(id)) void removeAsset(id)
  }
}

/**
 * 開機時該不該跑 `pruneOrphanedTextureAssets()`（Residual 1）。抽成純函式
 * 方便單元測試，也讓 `App.tsx` 的啟動流程只是照抄這個條件，不用自己在
 * `useEffect` 裡重新拼一次判斷式。
 *
 * 兩個條件都要成立才清理：
 * - `sceneRestored`：`loadSavedScene()` 的回傳值，`false` 代表存檔壞掉、
 *   `version` 不符、沒有存檔或 `localStorage` 拋例外——這些情況下場景是
 *   空的，清理會把所有貼圖資產誤判成孤兒。
 * - `textureStorageAvailable`：`useTextureStore.getState().storageAvailable`。
 *   貼圖儲存層本身已知不可用時，不要再去動它。
 */
export function shouldPruneAfterLoad(sceneRestored: boolean, textureStorageAvailable: boolean): boolean {
  return sceneRestored && textureStorageAvailable
}

/**
 * 開啟時載入上次的場景。沒有存檔或存檔壞掉時保持空場景。
 *
 * 回傳是否**真的**把場景還原成功（Residual 1）：`localStorage` 例外、
 * 沒有存檔、`deserializeScene` 回傳 `null`（JSON 壞掉或 `version` 不符）
 * 這三種情況都回傳 `false`。呼叫端（`App.tsx`）用這個回傳值決定要不要
 * 接著跑 `pruneOrphanedTextureAssets()`——還原失敗時場景是空的，
 * 若仍照跑清理，會把 IndexedDB 裡**所有**貼圖資產都當成孤兒清光，
 * 這是不可逆的資料遺失，而且使用者的存檔本身可能完全沒問題（只是
 * 這次讀取失敗），「圖還在」原本是可以救的狀態，不該被清理邏輯連帶賠上。
 *
 * 「沒有存檔」（全新使用者）也回傳 `false`、一併跳過清理：這種情況下
 * IndexedDB 通常也不會有殘留資產，跳過雖然不是必要，但可以讓回傳值
 * 保持單一語意（`true` 唯一代表「場景確實從存檔還原」），不需要再另外
 * 分辨「沒有存檔」與「有存檔但讀不出來」這兩種都是空場景的情況。
 */
export function loadSavedScene(): boolean {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(SCENE_STORAGE_KEY)
  } catch {
    return false
  }
  if (!raw) return false
  const restored = deserializeScene(raw)
  if (!restored) return false
  useSceneStore.getState().replaceScene(restored.objects, restored.projectName)
  return true
}

/** 訂閱場景變動並節流寫入 localStorage。回傳取消訂閱函式。 */
export function startAutoSave(): () => void {
  let timer: number | undefined

  const writeNow = () => {
    const state = useSceneStore.getState()
    try {
      localStorage.setItem(SCENE_STORAGE_KEY, serializeScene(state.objects, state.projectName))
    } catch {
      // 配額不足或無痕模式：貼圖仍在 IndexedDB，只是這次場景沒存起來
    }
  }

  const unsubscribe = useSceneStore.subscribe(() => {
    if (timer !== undefined) clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = undefined
      writeNow()
    }, 400)
  })

  /**
   * 分頁關掉／切到背景時，若還有一個 400ms 節流計時器沒跑到，代表最後一筆
   * 變更（例如剛放開的拖曳、剛打完的名字）還沒寫進 localStorage。
   * `pagehide` 之後沒有機會再跑非同步工作，所以這裡清掉待處理的計時器、
   * 改成立刻同步寫入一次——`localStorage.setItem` 本身是同步的，不需要
   * 等待。只在確實有待處理計時器時才寫，避免沒有新變更時的多餘寫入。
   */
  const flush = () => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
    writeNow()
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush()
  }

  // `pagehide` 比 `beforeunload` 可靠（行動裝置與 bfcache 都支援）；
  // `visibilitychange` 轉成 hidden 再補一次，涵蓋分頁被切到背景、
  // 手機切到別的 App 等 `pagehide` 不一定會觸發的情境。
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    if (timer !== undefined) clearTimeout(timer)
    unsubscribe()
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
