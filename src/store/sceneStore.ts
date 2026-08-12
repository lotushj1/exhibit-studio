import { create } from 'zustand'
import { newId } from '../lib/id'
import { createObject, getDef } from '../objects/registry'
import { coerceParam } from '../objects/paramCoerce'
import type { ObjectKind, ParamValue, SceneObject, SurfaceSpec } from '../objects/types'

export type CameraPresetId = 'front' | 'hero' | 'top' | 'side' | 'eye'

/**
 * 正交／透視投影模式。跟 `cameraPreset` 一樣是「這台瀏覽器現在怎麼看
 * 這個場景」的檢視偏好，不是場景內容本身——比照 `cameraPreset` 的做法
 * （見下方 `setProjection`），不進復原歷史、`replaceScene` 不覆寫它、
 * `clearScene` 才重置回預設值。
 */
export type ProjectionMode = 'perspective' | 'orthographic'

/**
 * 尺寸標註的顯示範圍。跟 `cameraPreset`/`projection` 一樣是檢視偏好，不是
 * 場景內容本身：不進 `Snapshot`、不進 `serializeScene`／專案檔、不進復原
 * 歷史（見下方 `setDimensionMode`），`clearScene` 才重置回 `'off'`。
 *
 * - `'off'`：不顯示任何標註。
 * - `'selected'`：只標註目前選取的物件（原本唯一的行為）。
 * - `'all'`：場景裡每個可見物件都各自標註長寬高，供輸出整排展櫃的完整
 *   標註圖給客戶或現場施工看。
 */
export type DimensionMode = 'off' | 'selected' | 'all'

const HISTORY_LIMIT = 50

type Snapshot = { objects: SceneObject[] }

/**
 * `setTransform` 的手勢 key 保留字。`setParam`/`setParamLive` 的 gesture key
 * 一律是 schema 裡實際存在的參數 key（例如 `widthCm`），不可能是這兩個字串，
 * 所以拿它們來代表「這是一段拖曳/搬移或旋轉手勢」不會跟任何參數手勢的 key 撞到，
 * 兩者可以安全共用同一套 `liveSnapshot`/`commit`/`settleLiveSnapshot` 機制。
 *
 * 位置與角度分成兩個獨立的 key（而不是共用一個），是因為它們是兩個獨立的手勢：
 * 地面拖曳中的一段「位置」liveSnapshot 還掛著沒結算時，使用者若從屬性面板
 * 改同一個物件的「角度」，如果共用同一個 key，`commit` 會誤判成「這是來
 * 收尾那個位置拖曳的」，把兩個獨立操作合併成一筆 undo。分開 key 之後，
 * 角度的 commit 會先把懸掛的位置手勢結算成它自己獨立的一筆，再處理角度變更。
 */
const TRANSFORM_POSITION_KEY = 'transform.position'
const TRANSFORM_ROTATION_KEY = 'transform.rotationY'

/**
 * `setSurface` 的手勢 key：每個面各自獨立，用 `surface.<surfaceId>` 組成，
 * 不會跟 schema 參數 key（無點號）或上面兩個 transform 保留字撞名。
 * 同一個面上的貼圖位移、平鋪大小、旋轉、材質、顏色都共用這一把 key——
 * 它們是同一個「調整這個面」的操作單位，不需要再依欄位細分（比較 `setTransform`
 * 把位置與角度分成兩把 key，是因為那兩者是兩個可能交錯的獨立手勢；
 * 這裡同一面的欄位變更不會交錯，共用一把 key 即可）。
 */
const surfaceKey = (surfaceId: string) => `surface.${surfaceId}`

/**
 * `patchObjectLive` 拖曳期間暫存的「手勢前」快照，額外記著這個手勢屬於
 * 哪個物件的哪個參數（`id`+`key`）。單一 store 只有一個 `liveSnapshot`，
 * 沒有這兩個欄位就無法分辨「這次 commit 是不是在結束同一段手勢」——
 * 詳見 `commit`/`patchObjectLive`/`settleLiveSnapshot` 的說明。
 */
type LiveSnapshot = Snapshot & { id: string; key: string }

type SceneState = {
  objects: SceneObject[]
  selectedId: string | null
  projectName: string
  dimensionMode: DimensionMode
  cameraPreset: CameraPresetId
  projection: ProjectionMode
  past: Snapshot[]
  future: Snapshot[]

  addObject: (kind: ObjectKind) => string
  removeObject: (id: string) => void
  duplicateObject: (id: string) => string | null
  selectObject: (id: string | null) => void
  setParam: (id: string, key: string, value: ParamValue) => void
  /**
   * 跟 `setParam` 做一樣的事（含 clamp、sideEffect），但**不進復原歷史**。
   * 給滑桿拖曳這種「畫面要即時跟著動、但放開前都還算同一個操作」的場景用：
   * 拖曳中每一格呼叫這個，放開時才呼叫一次 `setParam` 真正 commit。
   */
  setParamLive: (id: string, key: string, value: ParamValue) => void
  /**
   * 搬移/旋轉物件。預設（`opts` 省略或 `live` 為 false）跟其他一般動作一樣
   * 一律進復原歷史。傳入 `{ live: true }` 則走跟 `setParamLive` 相同的
   * 「即時更新、不進歷史」路徑——地面拖曳每個 `pointermove` 都呼叫 `live`
   * 版本，放開滑鼠時呼叫一次不帶 `live` 的版本收尾，兩者用同一個
   * `TRANSFORM_POSITION_KEY` 手勢 key，讓 `commit` 能辨認「這次收尾是不是在
   * 結束剛剛那段拖曳」，只推一筆歷史，undo 一次就退回拖曳前的位置。
   * 角度變更用另一個獨立的 `TRANSFORM_ROTATION_KEY`，跟位置手勢互不干擾。
   */
  setTransform: (id: string, patch: Partial<SceneObject['transform']>, opts?: { live?: boolean }) => void
  /**
   * 修改指定面的材質／顏色／貼圖設定。預設一律進復原歷史。傳入
   * `{ live: true }` 走跟 `setParamLive`/`setTransform` 的 `live` 版本相同的
   * 「即時更新、不進歷史」路徑——貼圖的位移／平鋪大小滑桿拖曳中每格呼叫
   * `live` 版本，放開時呼叫一次不帶 `live` 的版本收尾，兩者共用同一個
   * `surfaceKey(surfaceId)` 手勢 key，只推一筆歷史，undo 一次退回拖曳前。
   */
  setSurface: (id: string, surfaceId: string, patch: Partial<SurfaceSpec>, opts?: { live?: boolean }) => void
  renameObject: (id: string, name: string) => void
  toggleVisible: (id: string) => void
  toggleLocked: (id: string) => void
  setProjectName: (name: string) => void
  setDimensionMode: (mode: DimensionMode) => void
  setCameraPreset: (id: CameraPresetId) => void
  setProjection: (mode: ProjectionMode) => void
  undo: () => void
  redo: () => void
  replaceScene: (objects: SceneObject[], projectName: string) => void
  clearScene: () => void
}

/**
 * 深拷貝場景物件陣列，讓復原歷史快照與現況不共用可變狀態
 * （params、transform.position、surfaces map 都各自產生新物件/陣列）。
 *
 * 例外：`surfaces[id].texture` 子物件本身**不**深拷貝，只沿用原參考。
 * 這是刻意的：`setSurface` 對 texture 永遠是整包替換（`{ ...current, ...patch }`），
 * 從不就地修改 texture 物件或其 `offset` 陣列。`SurfaceMaterial`（Task 7）用
 * `spec.texture` 的物件身分當 `useMemo` 相依值來判斷要不要重建 GPU 貼圖；
 * 如果這裡連沒被 patch 到的 texture 都跟著複製出新參考，
 * 就會讓「只改顏色／只搬位置」這種操作也讓全場景所有物件的貼圖一起被判定為
 * 「變了」而重建，白白浪費 GPU 資源且無視覺效果。只要 texture 永遠整包替換這個前提不破，
 * 沿用參考就是安全的深拷貝替代方案。
 */
function cloneObjects(objects: SceneObject[]): SceneObject[] {
  return objects.map((o) => ({
    ...o,
    params: { ...o.params },
    transform: { position: [...o.transform.position] as [number, number, number], rotationY: o.transform.rotationY },
    surfaces: Object.fromEntries(Object.entries(o.surfaces).map(([k, v]) => [k, { ...v }])),
  }))
}

/**
 * 深比較兩份物件陣列的內容是否完全相同（Finding 1：沒有實際變更的呼叫
 * 不該推進復原歷史、也不該清空 future）。
 *
 * 用 `JSON.stringify` 比對而不是逐欄位手寫比較：場景物件數量通常是個位數
 * 到十幾個，序列化的成本可忽略，換來的是不用在每次新增一個參數/欄位時
 * 都要記得同步更新一份手寫的比較邏輯——那正是這裡要避免的「兩處各自演化」
 * 問題本身。
 */
function sameObjects(a: SceneObject[], b: SceneObject[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export const useSceneStore = create<SceneState>((set, get) => {
  /**
   * 拖曳一類的即時更新（見 `patchObjectLive`）在放開前的「原始值」快照，
   * 額外記著這段手勢屬於哪個物件的哪個參數（`id`+`key`）。只在手勢進行
   * 期間存在；正常結束（同一個 `id`+`key` 呼叫 `setParam`）或被中途放棄
   * （見下方 `settleLiveSnapshot`）都會清空。這是模組層的可變閉包變數，
   * 不是 store 的一部分——它是純粹的暫存狀態，不需要（也不應該）觸發
   * React 重新渲染或被 undo/redo 直接讀寫。
   */
  let liveSnapshot: LiveSnapshot | null = null

  /**
   * 把目前掛著的 `liveSnapshot` 結算成一筆**獨立**的復原歷史，然後清空。
   *
   * 用於「手勢被中途放棄」的情境：使用者拖到一半，`onValueCommit` 卻沒有
   * 觸發（切分頁、視窗失焦、指標捕獲丟失、物件被刪除……），但拖曳出來的
   * 值已經寫進 `objects` 了。如果放著不管，下一個不相干的操作一旦呼叫
   * `commit()`，就會把這個「有變更、卻沒被記錄」的手勢**吃進**那次不相干
   * 的 commit 裡，變成「使用者按一次 Cmd+Z 卻同時退掉兩件事」。
   *
   * 這裡只動 `past`/`future`，不碰 `objects`——因為 `objects` 已經是手勢
   * 放棄當下的正確畫面（拖曳出來的值），我們只是把它從「未記錄的即時
   * 更新」正式歸檔成「一筆完整的歷史」。歸檔後這筆手勢本身可以被單獨
   * undo，回到手勢開始前的狀態。
   */
  const settleLiveSnapshot = () => {
    if (!liveSnapshot) return
    const snapshot: Snapshot = { objects: liveSnapshot.objects }
    const currentObjects = get().objects
    liveSnapshot = null
    // 手勢從頭到尾淨變化為零（例如拖到某個值又拖回原點，從未呼叫非 live
    // 版本收尾）：不留下一筆「什麼都沒變」的歷史，也不清空 future——
    // 跟 `commit` 的變更偵測是同一件事的兩個入口，見 Finding 1 的說明。
    if (sameObjects(snapshot.objects, currentObjects)) return
    const state = get()
    const past = [...state.past, snapshot].slice(-HISTORY_LIMIT)
    set({ past, future: [] })
  }

  /**
   * 執行一個會進入復原歷史的變更。
   *
   * `gesture` 用來判斷這次 commit 是不是在**結束**目前掛著的 `liveSnapshot`
   * 那段手勢：只有 `gesture` 存在且 `id`/`key` 都跟 `liveSnapshot` 相符
   * （也就是 `setParam` 對同一個物件同一個參數收尾、或 `setTransform` 對
   * 同一個物件的搬移手勢收尾），才會拿 `liveSnapshot`
   * 當歷史基準——因為此時 `get()` 當下的狀態已經被拖曳過程中的即時更新
   * 改到幾乎等於最終值了，用它當基準會讓 undo 一次只退回拖曳中的某個
   * 中間值，而不是拖曳前的原始值。
   *
   * 如果 `gesture` 不符（或根本沒傳，例如 `renameObject`/`addObject`
   * 這些完全無關的操作），代表現在這次 commit 跟掛著的
   * `liveSnapshot` 是兩件不相干的事——必須先把 `liveSnapshot` 結算成它
   * 自己獨立的一筆歷史（`settleLiveSnapshot`），再繼續處理這次 commit，
   * 兩者才不會被混成一筆。
   */
  const commit = (
    mutate: (objects: SceneObject[]) => SceneObject[],
    gesture?: { id: string; key: string },
  ) => {
    const isSameGesture = !!gesture && !!liveSnapshot && liveSnapshot.id === gesture.id && liveSnapshot.key === gesture.key
    if (liveSnapshot && !isSameGesture) {
      settleLiveSnapshot()
    }
    const state = get()
    const snapshot: Snapshot = liveSnapshot ?? { objects: cloneObjects(state.objects) }
    liveSnapshot = null
    const nextObjects = mutate(cloneObjects(state.objects))
    // 變更偵測（Finding 1）：把「這次呼叫實際上什麼都沒改」跟「呼叫了一個
    // store 動作」分開。點進數字欄位又點走、點一下滑桿 thumb 不拖曳、對一個
    // 不存在的 surfaceId 呼叫 setSurface……這些都會走到這裡，如果無條件推
    // 快照，會在使用者完全沒做任何事的情況下吃掉一格歷史、還把 redo 堆疊
    // 清空。比較基準用 `snapshot.objects`（手勢開始前，或這次呼叫之前）而
    // 不是 `state.objects`：同一段手勢多次呼叫時，中間的 live 更新已經寫進
    // `state.objects`，用它當基準會讓「手勢整體其實沒有淨變化」被誤判為
    // 「有變化」。
    // 沒有變化就完全不呼叫 `set()`：`state.objects` 本來就已經等於（在值上）
    // `nextObjects`，不需要用一份新 clone 覆蓋掉現有參考去換一次不必要的
    // React 重新渲染。
    //
    // 沒寫下來的前提（順帶項）：這裡直接 return，不會把 `state.objects`
    // 對齊回 `nextObjects`（或 `snapshot.objects`）。目前這是對的，因為
    // 所有呼叫端的「最後一次 live 值」永遠等於「這次要提交的值」——
    // Radix 的 `onValueCommit` 帶的就是最後一次 `onValueChange` 收到的值，
    // `finishDrag` 傳的是 `lastPos.current`，兩者跟 `state.objects` 當下
    // 的內容在值上一致，所以「不覆寫」等同「已經是提交值」。如果未來有
    // 呼叫端提交的值跟它自己最後一次 live 值不同，這個 return 會讓那個
    // 差異值留在畫面上、沒有進歷史、也無法用 undo 復原——因為快照根本
    // 沒被推進 `past`。新增呼叫端時要保住這個前提，或改成明確對齊。
    if (sameObjects(snapshot.objects, nextObjects)) return
    const past = [...state.past, snapshot].slice(-HISTORY_LIMIT)
    set({ objects: nextObjects, past, future: [] })
  }

  /**
   * 對指定 id 的物件套用變更並進入復原歷史，且一律視為跟目前掛著的
   * `liveSnapshot`（若有）不相干——用於 `setTransform`/`setSurface`/
   * `renameObject`/`toggleVisible`/`toggleLocked` 這些沒有「參數 key」
   * 概念、也永遠不是滑桿手勢延續的動作。
   *
   * 守衛放在 `commit` 之前、而不是丟給 `commit` 內部的 mutate 回呼去判斷：
   * `commit` 一被呼叫就無條件把現況推進 `past`、清空 `future`——如果 id
   * 不存在的情況要等進了 `commit` 才發現「其實什麼都沒變」，快照已經存下去了。
   * 用不存在的 id 呼叫這裡（例如指向一個已經被刪除的物件）必須是完全的
   * no-op：不能吃掉一格歷史，更不能把使用者按過 undo 之後留著的 redo 堆疊清空、
   * 也不該去結算一個跟這次無關的 `liveSnapshot`。
   */
  const patchObject = (id: string, fn: (o: SceneObject) => void) => {
    if (!get().objects.some((o) => o.id === id)) return
    commit((objects) => {
      const target = objects.find((o) => o.id === id)
      if (target) fn(target)
      return objects
    })
  }

  /**
   * 帶手勢 key 的 commit 路徑：把 `id`+`key` 當成 gesture 傳給 `commit`，
   * 讓它能辨認「這次呼叫是不是在結束同一個物件同一段手勢」。目前有兩種
   * 呼叫者：`setParam`（收尾）用實際的參數 key（例如 `widthCm`），
   * `setTransform`（收尾）用保留字 `TRANSFORM_POSITION_KEY`/`TRANSFORM_ROTATION_KEY`。跟 `patchObject`
   * 分開，是因為其他呼叫 `patchObject` 的動作（改名、鎖定……）沒有「手勢
   * key」概念，永遠不該被誤判成某段手勢的延續。
   */
  const patchObjectForParam = (id: string, key: string, fn: (o: SceneObject) => void) => {
    if (!get().objects.some((o) => o.id === id)) return
    commit((objects) => {
      const target = objects.find((o) => o.id === id)
      if (target) fn(target)
      return objects
    }, { id, key })
  }

  /**
   * 對指定 id 的物件套用變更，但**不**進入復原歷史、也不清空 `future`。
   * 用於滑桿拖曳這種「畫面要即時跟著動、但每一格都推一筆歷史會把
   * `HISTORY_LIMIT` 灌爆並讓 undo 變成一格一格微調」的場景。
   *
   * 同一段手勢（同一個 `id`+`key`）第一次呼叫時，把「手勢前」的狀態連同
   * `id`/`key` 存進 `liveSnapshot`；後續呼叫只更新畫面用的 `objects`，不會
   * 覆寫這份快照。如果目前掛著的 `liveSnapshot` 屬於**不同**的 `id` 或
   * `key`，代表上一段手勢被放棄了（使用者換了另一個物件、或同一物件的
   * 另一個參數）——先把它結算成獨立的一筆歷史，再開始記錄這段新手勢。
   *
   * 等使用者放開、呼叫真正 commit 的動作（`setParam`，同一個 `id`+`key`）
   * 時，`commit()` 會讀取並清空這份快照當作歷史基準。
   *
   * 不存在的 id 一樣是完全 no-op：不建立快照、不改 `objects`、也不結算
   * 任何（跟這次呼叫無關的）掛著的手勢。
   */
  const patchObjectLive = (id: string, key: string, fn: (o: SceneObject) => void) => {
    if (!get().objects.some((o) => o.id === id)) return
    if (liveSnapshot && (liveSnapshot.id !== id || liveSnapshot.key !== key)) {
      settleLiveSnapshot()
    }
    if (!liveSnapshot) {
      const state = get()
      liveSnapshot = { objects: cloneObjects(state.objects), id, key }
    }
    const next = cloneObjects(get().objects)
    const target = next.find((o) => o.id === id)
    if (target) fn(target)
    set({ objects: next })
  }

  /**
   * `setParam` 與 `setParamLive` 共用的核心邏輯：clamp 數值、套用
   * `sideEffect`。差別只在最後走哪條 patch 路徑（`patchObjectForParam`
   * 進歷史、`patchObjectLive` 不進）。
   */
  const applyParam = (id: string, key: string, value: ParamValue, live: boolean) => {
    const target = get().objects.find((o) => o.id === id)
    if (!target) return
    const def = getDef(target.kind)
    const paramDef = def.schema.find((p) => p.key === key)
    if (!paramDef) return
    // 內部呼叫端的型別已經由 TS 保證，`coerceParam` 理論上不會回傳
    // `undefined`；這裡的 `?? value` 只是防禦性 fallback，共用的是數字
    // 夾制那部分邏輯（跟 `reconcile` 對未信任輸入共用同一份 `coerceParam`，
    // 見 Finding 3）。
    const next = coerceParam(paramDef, value) ?? value
    const mutate = (o: SceneObject) => {
      o.params[key] = next
      if (paramDef.sideEffect) {
        const extra = paramDef.sideEffect(next, o.params)
        for (const [k, v] of Object.entries(extra)) {
          const d = def.schema.find((p) => p.key === k)
          if (!d) continue
          o.params[k] = coerceParam(d, v) ?? v
        }
      }
    }
    if (live) {
      patchObjectLive(id, key, mutate)
    } else {
      patchObjectForParam(id, key, mutate)
    }
  }

  return {
    objects: [],
    selectedId: null,
    projectName: '未命名專案',
    dimensionMode: 'off',
    cameraPreset: 'hero',
    projection: 'perspective',
    past: [],
    future: [],

    addObject(kind) {
      const obj = createObject(kind)
      commit((objects) => [...objects, obj])
      set({ selectedId: obj.id })
      return obj.id
    },

    removeObject(id) {
      // 守衛要放在 commit 之前：commit 一被呼叫就無條件推快照、清空 future，
      // 用不存在的 id 呼叫必須是完全的 no-op（見 patchObject 的說明）。
      if (!get().objects.some((o) => o.id === id)) return
      commit((objects) => objects.filter((o) => o.id !== id))
      if (get().selectedId === id) set({ selectedId: null })
    },

    duplicateObject(id) {
      const source = get().objects.find((o) => o.id === id)
      if (!source) return null
      const [copy] = cloneObjects([source])
      copy.id = newId(`${source.kind}_copy`)
      copy.name = `${source.name} 複本`
      copy.transform.position = [
        source.transform.position[0] + 0.3,
        source.transform.position[1],
        source.transform.position[2] + 0.3,
      ]
      commit((objects) => [...objects, copy])
      set({ selectedId: copy.id })
      return copy.id
    },

    selectObject(id) {
      set({ selectedId: id })
    },

    setParam(id, key, value) {
      applyParam(id, key, value, false)
    },

    setParamLive(id, key, value) {
      applyParam(id, key, value, true)
    },

    setTransform(id, patch, opts) {
      // 位置與角度是兩個獨立的手勢（各自的 gesture key 見下方），呼叫端必須
      // 一次只挑一個傳。目前沒有任何呼叫端會兩個一起傳，這裡防呆是為了
      // 避免未來新增的呼叫端誤傳兩者時被靜默歸類成錯的手勢 key，讓兩個
      // 獨立操作被誤判成同一段手勢的收尾（或反過來把一次操作拆成看似無關
      // 的兩段）。
      if (patch.position !== undefined && patch.rotationY !== undefined) {
        throw new Error('setTransform 不支援同時傳入 position 與 rotationY，請分開呼叫')
      }
      const target = get().objects.find((o) => o.id === id)
      if (!target || target.locked) return
      const mutate = (o: SceneObject) => {
        if (patch.position) o.transform.position = [...patch.position] as [number, number, number]
        if (patch.rotationY !== undefined) o.transform.rotationY = patch.rotationY
      }
      // 位置與角度是兩個獨立的手勢，各自用自己的保留字 key，不會互相干擾
      // （見 TRANSFORM_POSITION_KEY/TRANSFORM_ROTATION_KEY 上方註解）。
      const key = patch.position !== undefined ? TRANSFORM_POSITION_KEY : TRANSFORM_ROTATION_KEY
      if (opts?.live) {
        patchObjectLive(id, key, mutate)
      } else {
        patchObjectForParam(id, key, mutate)
      }
    },

    setSurface(id, surfaceId, patch, opts) {
      const mutate = (o: SceneObject) => {
        const current = o.surfaces[surfaceId]
        if (!current) return
        o.surfaces[surfaceId] = { ...current, ...patch }
      }
      const key = surfaceKey(surfaceId)
      if (opts?.live) {
        patchObjectLive(id, key, mutate)
      } else {
        patchObjectForParam(id, key, mutate)
      }
    },

    renameObject(id, name) {
      patchObject(id, (o) => {
        o.name = name
      })
    },

    toggleVisible(id) {
      patchObject(id, (o) => {
        o.visible = !o.visible
      })
    },

    toggleLocked(id) {
      patchObject(id, (o) => {
        o.locked = !o.locked
      })
    },

    // `projectName` 故意**不**是 `Snapshot` 的欄位（Finding 順帶項）：`TopBar`
    // 的專案名稱輸入框每個按鍵都呼叫這個動作，如果它進了復原歷史，要嘛
    // 每次打字都吃一筆歷史把 `HISTORY_LIMIT` 灌爆，要嘛得額外包一層跟
    // Finding 1 一樣的變更偵測。更根本的是：專案名稱是文件層級的中繼資料，
    // 不是場景內容的一部分，使用者對「搬移一個物件」按 Cmd+Z 時，直覺不會
    // 預期連專案名稱都被改回去。讓 `projectName` 完全不進 `past`/`future`，
    // 從根本上排除「改名字之後，對不相干的操作按 Cmd+Z 卻連名字也被還原」
    // 這個問題，而不是在 commit 的變更偵測上疊一層特例。
    setProjectName(name) {
      set({ projectName: name })
    },

    // 跟 `setCameraPreset`/`setProjection` 同一類：標註範圍是檢視偏好，不是
    // 場景內容，不進 `past`/`future`（見上方 `DimensionMode` 的說明）。
    setDimensionMode(mode) {
      set({ dimensionMode: mode })
    },

    setCameraPreset(id) {
      set({ cameraPreset: id })
    },

    // 跟 `setCameraPreset`/`setProjectName` 同一類：投影模式是檢視偏好，
    // 不是場景內容，不進 `past`/`future`（見上方 `ProjectionMode` 的說明）。
    setProjection(mode) {
      if (get().projection === mode) return
      set({ projection: mode })
    },

    undo() {
      // 如果有一段手勢的 liveSnapshot 還掛著沒收尾（例如拖曳到一半被中斷，
      // 從未呼叫非 live 版本收尾），必須先把它結算成它自己獨立的一筆歷史，
      // 而不是直接丟棄——丟棄的話，這段已經寫進畫面的變更就再也退不回去了
      // （它從未進過 past，undo 也就永遠碰不到它）。結算後再繼續正常的
      // undo：這樣 Cmd+Z 退掉的正是那段被中斷的手勢，符合直覺。
      if (liveSnapshot) settleLiveSnapshot()
      const state = get()
      const previous = state.past[state.past.length - 1]
      if (!previous) return
      set({
        objects: previous.objects,
        past: state.past.slice(0, -1),
        future: [{ objects: cloneObjects(state.objects) }, ...state.future].slice(0, HISTORY_LIMIT),
        selectedId: previous.objects.some((o) => o.id === state.selectedId) ? state.selectedId : null,
      })
    },

    redo() {
      // 理由同 `undo`：先結算任何懸掛的手勢，不要直接丟棄。結算本身會清空
      // `future`（跟任何新 commit 的行為一致——這段手勢確實是一個新發生的
      // 變更，理應讓原本的 redo 堆疊失效），所以結算後如果 `future` 已經
      // 空了，下面的 `if (!next) return` 會自然地讓這次 redo 呼叫變成
      // no-op，不會去 redo 一個已經不成立的未來狀態。
      if (liveSnapshot) settleLiveSnapshot()
      const state = get()
      const next = state.future[0]
      if (!next) return
      set({
        objects: next.objects,
        past: [...state.past, { objects: cloneObjects(state.objects) }].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        selectedId: next.objects.some((o) => o.id === state.selectedId) ? state.selectedId : null,
      })
    },

    replaceScene(objects, projectName) {
      liveSnapshot = null
      set({ objects: cloneObjects(objects), projectName, selectedId: null, past: [], future: [] })
    },

    clearScene() {
      liveSnapshot = null
      set({
        objects: [],
        selectedId: null,
        projectName: '未命名專案',
        dimensionMode: 'off',
        cameraPreset: 'hero',
        projection: 'perspective',
        past: [],
        future: [],
      })
    },
  }
})
