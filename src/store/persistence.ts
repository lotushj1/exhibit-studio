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

/** 收集目前場景與所有 undo／redo 快照仍可能恢復的貼圖參照。 */
function referencedTextureAssetIds(): Set<string> {
  const state = useSceneStore.getState()
  const usedIds = new Set<string>()
  const snapshots = [
    { objects: state.objects },
    ...state.past,
    ...state.future,
  ]
  for (const snapshot of snapshots) {
    for (const object of snapshot.objects) {
      for (const surface of Object.values(object.surfaces)) {
        if (surface.texture) usedIds.add(surface.texture.assetId)
      }
    }
  }
  return usedIds
}

/**
 * 清掉目前場景與復原歷史都不再參照的貼圖資產。
 *
 * `assetIds` 是自動清理路徑傳入的變更前資產清單。限定掃描這份清單可
 * 避免使用者上傳圖片後、尚未把它附加到 surface 前，剛好遇到
 * `clearScene`／`replaceScene` 的節流回呼而被誤刪。手動呼叫不傳參數時
 * 會掃描目前全部資產，方便啟動清理與單元測試。
 */
export function pruneOrphanedTextureAssets(assetIds?: ReadonlySet<string>): void {
  const usedIds = new Set<string>()
  for (const id of referencedTextureAssetIds()) usedIds.add(id)
  const { assets, removeAsset } = useTextureStore.getState()
  const candidates = assetIds ?? new Set(Object.keys(assets))
  for (const id of candidates) {
    if (!assets[id]) continue
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
 * 啟動時只清理由 IndexedDB 載入的既有資產，並套用場景／儲存層安全閘門。
 * 回傳是否實際排程清理，方便啟動流程與測試明確區分「跳過」與「已處理」。
 */
export function pruneLoadedTextureAssetsAfterLoad(
  sceneRestored: boolean,
  textureStorageAvailable: boolean,
  loadedAssetIds: ReadonlySet<string>,
): boolean {
  if (!shouldPruneAfterLoad(sceneRestored, textureStorageAvailable)) return false
  pruneOrphanedTextureAssets(loadedAssetIds)
  return true
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
export function startAutoSave(initialAssetIds?: Promise<ReadonlySet<string>>): () => void {
  let timer: number | undefined
  let knownAssetIds = new Set(Object.keys(useTextureStore.getState().assets))
  let pendingPruneCandidates: Set<string> | null = null
  let disposed = false

  // 啟動時 IndexedDB 載入是非同步的；先訂閱場景變更仍可立即儲存，
  // 等 Promise 完成後再把「啟動前已存在」的 id 補進候選集合。清理用的
  // Promise callback 會在 startAutoSave 建立後才執行，第一個載入完成後的
  // scene change 因而不會漏掉這批既有資產。
  void initialAssetIds?.then(
    (loadedIds) => {
      if (disposed) return
      for (const id of loadedIds) knownAssetIds.add(id)
    },
    () => {
      // `loadAll` 目前會把儲存層錯誤轉成空集合；這裡仍防禦性吞掉
      // 未來實作變更可能拋出的 rejection，不能讓自動儲存造成未處理錯誤。
    },
  )

  const writeNow = () => {
    const state = useSceneStore.getState()
    try {
      localStorage.setItem(SCENE_STORAGE_KEY, serializeScene(state.objects, state.projectName))
    } catch {
      // 配額不足或無痕模式：貼圖仍在 IndexedDB，只是這次場景沒存起來
    }
  }

  const unsubscribe = useSceneStore.subscribe((state, previous) => {
    const sceneChanged = !(
      state.objects === previous.objects &&
      state.past === previous.past &&
      state.future === previous.future
    )

    if (sceneChanged) {
      // 只掃描這次場景變更前就存在的資產。新上傳／匯入的資產會在下一次
      // 場景變更時才進入候選，給 UI 把 assetId 寫進 surface 的完整非同步流程
      // 留出安全窗口。
      const assetsAtChange = new Set(Object.keys(useTextureStore.getState().assets))
      pendingPruneCandidates = new Set([...assetsAtChange].filter((id) => knownAssetIds.has(id)))
      knownAssetIds = assetsAtChange
    }
    if (timer !== undefined) clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = undefined
      writeNow()
      if (pendingPruneCandidates) {
        pruneOrphanedTextureAssets(pendingPruneCandidates)
        pendingPruneCandidates = null
      }
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
    if (pendingPruneCandidates) {
      pruneOrphanedTextureAssets(pendingPruneCandidates)
      pendingPruneCandidates = null
    }
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
    disposed = true
    if (timer !== undefined) clearTimeout(timer)
    unsubscribe()
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
