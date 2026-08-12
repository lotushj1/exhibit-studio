import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  serializeScene, deserializeScene, SCENE_VERSION, SCENE_STORAGE_KEY, startAutoSave,
  pruneOrphanedTextureAssets, loadSavedScene, shouldPruneAfterLoad,
  pruneLoadedTextureAssetsAfterLoad,
} from './persistence'
import { createObject } from '../objects/registry'
import { useSceneStore } from './sceneStore'
import { useTextureStore } from '../materials/textureStore'

describe('serializeScene 與 deserializeScene', () => {
  it('來回轉換保留所有物件資料', () => {
    const objects = [createObject('boxPlinth'), createObject('humanFigure')]
    objects[0].params.widthCm = 250
    objects[0].surfaces.front.color = '#123456'
    objects[1].transform.position = [1.5, 0, -2]
    objects[1].transform.rotationY = 0.8

    const restored = deserializeScene(serializeScene(objects, '測試專案'))
    expect(restored).not.toBeNull()
    expect(restored!.projectName).toBe('測試專案')
    expect(restored!.objects).toHaveLength(2)
    expect(restored!.objects[0].params.widthCm).toBe(250)
    expect(restored!.objects[0].surfaces.front.color).toBe('#123456')
    expect(restored!.objects[1].transform.position).toEqual([1.5, 0, -2])
    expect(restored!.objects[1].transform.rotationY).toBeCloseTo(0.8, 10)
  })

  it('寫入的資料帶版本號', () => {
    const parsed = JSON.parse(serializeScene([], '專案'))
    expect(parsed.version).toBe(SCENE_VERSION)
  })

  it('壞掉的 JSON 回傳 null 而不是拋錯', () => {
    expect(deserializeScene('這不是 JSON')).toBeNull()
    expect(deserializeScene('')).toBeNull()
    expect(deserializeScene('{')).toBeNull()
  })

  it('版本不符回傳 null', () => {
    const raw = JSON.stringify({ version: 999, projectName: 'x', objects: [] })
    expect(deserializeScene(raw)).toBeNull()
  })

  it('缺少 objects 陣列回傳 null', () => {
    expect(deserializeScene(JSON.stringify({ version: SCENE_VERSION, projectName: 'x' }))).toBeNull()
  })

  it('略過 kind 未註冊的物件，其餘照常載入', () => {
    const good = createObject('boxPlinth')
    const raw = JSON.stringify({
      version: SCENE_VERSION,
      projectName: '專案',
      objects: [good, { ...good, id: 'bad', kind: 'notARealKind' }],
    })
    const restored = deserializeScene(raw)
    expect(restored!.objects).toHaveLength(1)
    expect(restored!.objects[0].id).toBe(good.id)
  })

  it('略過結構殘缺的物件', () => {
    const good = createObject('boxPlinth')
    const raw = JSON.stringify({
      version: SCENE_VERSION,
      projectName: '專案',
      objects: [good, { id: 'x', kind: 'boxPlinth' }, null, 'nope'],
    })
    const restored = deserializeScene(raw)
    expect(restored!.objects).toHaveLength(1)
  })

  it('缺少的參數用 schema 預設值補回，多餘的參數丟掉', () => {
    const obj = createObject('boxPlinth')
    delete obj.params.heightCm
    obj.params.legacyParam = 42
    const raw = JSON.stringify({ version: SCENE_VERSION, projectName: '專案', objects: [obj] })
    const restored = deserializeScene(raw)!
    expect(restored.objects[0].params.heightCm).toBe(90)
    expect(restored.objects[0].params.legacyParam).toBeUndefined()
  })

  it('缺少的 surface 用預設材質補回', () => {
    const obj = createObject('boxPlinth')
    delete obj.surfaces.top
    const raw = JSON.stringify({ version: SCENE_VERSION, projectName: '專案', objects: [obj] })
    const restored = deserializeScene(raw)!
    expect(restored.objects[0].surfaces.top.finish).toBe('matte')
  })

  describe('Finding 3：reconcile 還原參數時跟 applyParam 共用同一份 clamp/finite 邏輯', () => {
    it('超出 schema min/max 的數字被夾在合法範圍內（面板與渲染才會一致）', () => {
      const obj = createObject('openShelf')
      obj.params.heightCm = 30 // schema 規定 min: 60
      const raw = JSON.stringify({ version: SCENE_VERSION, projectName: '專案', objects: [obj] })
      const restored = deserializeScene(raw)!
      expect(restored.objects[0].params.heightCm).toBe(60)
    })

    it('NaN 不會通過（typeof NaN === "number" 會被只檢查 typeof 的舊邏輯放行）', () => {
      const obj = createObject('openShelf')
      obj.params.heightCm = NaN
      const raw = JSON.stringify({ version: SCENE_VERSION, projectName: '專案', objects: [obj] })
      const restored = deserializeScene(raw)!
      // NaN 序列化成 JSON 會變成 null，型別已經不是 number，退回 schema 預設值
      expect(restored.objects[0].params.heightCm).toBe(180)
    })
  })

  describe('Finding 4：texture 子物件的欄位驗證，任一欄不合法就整包丟掉退回純色', () => {
    function withTexture(texture: unknown) {
      const obj = createObject('boxPlinth')
      obj.surfaces.front = { finish: 'matte', color: '#ffffff', texture: texture as never }
      return JSON.stringify({ version: SCENE_VERSION, projectName: '專案', objects: [obj] })
    }

    it('fit 不是 cover/contain/repeat 之一：texture 被丟掉，該面退回純色，其餘正常', () => {
      const raw = withTexture({ assetId: 'tex_1', fit: 'weird', offset: [0, 0], scale: 1, rotation: 0, unlit: false })
      const restored = deserializeScene(raw)!
      expect(restored.objects[0].surfaces.front.texture).toBeUndefined()
      expect(restored.objects[0].surfaces.front.color).toBe('#ffffff')
    })

    it('rotation: 45（不是 0/90/180/270 之一，介面的 90 度旋轉按鈕永遠轉不回 0）：texture 被丟掉', () => {
      const raw = withTexture({ assetId: 'tex_1', fit: 'cover', offset: [0, 0], scale: 1, rotation: 45 })
      const restored = deserializeScene(raw)!
      expect(restored.objects[0].surfaces.front.texture).toBeUndefined()
    })

    it('offset 是字串陣列：texture 被丟掉，不會讓 computeTextureFit 吃到 NaN', () => {
      const raw = withTexture({ assetId: 'tex_1', fit: 'cover', offset: ['a', 'b'], scale: 1, rotation: 0, unlit: false })
      const restored = deserializeScene(raw)!
      expect(restored.objects[0].surfaces.front.texture).toBeUndefined()
    })

    it('assetId 缺漏：texture 被丟掉', () => {
      const raw = withTexture({ fit: 'cover', offset: [0, 0], scale: 1, rotation: 0, unlit: false })
      const restored = deserializeScene(raw)!
      expect(restored.objects[0].surfaces.front.texture).toBeUndefined()
    })

    it('合法的 texture 完整保留，舊存檔沒有 unlit 時補成 false', () => {
      const raw = withTexture({ assetId: 'tex_1', fit: 'repeat', offset: [0.1, -0.2], scale: 1.5, rotation: 90 })
      const restored = deserializeScene(raw)!
      expect(restored.objects[0].surfaces.front.texture).toEqual({
        assetId: 'tex_1', fit: 'repeat', offset: [0.1, -0.2], scale: 1.5, rotation: 90, unlit: false,
      })
    })

    it('unlit 為 true 時保留', () => {
      const raw = withTexture({ assetId: 'tex_1', fit: 'cover', offset: [0, 0], scale: 1, rotation: 0, unlit: true })
      const restored = deserializeScene(raw)!
      expect(restored.objects[0].surfaces.front.texture?.unlit).toBe(true)
    })

    it('unlit 型別不對：整個 texture 被丟掉，跟其他欄位一致', () => {
      const raw = withTexture({ assetId: 'tex_1', fit: 'cover', offset: [0, 0], scale: 1, rotation: 0, unlit: 'yes' })
      const restored = deserializeScene(raw)!
      expect(restored.objects[0].surfaces.front.texture).toBeUndefined()
    })
  })
})

describe('shouldPruneAfterLoad（Residual 1：抽成純函式的清理條件）', () => {
  it('場景還原成功且貼圖儲存層可用：true', () => {
    expect(shouldPruneAfterLoad(true, true)).toBe(true)
  })

  it('場景還原失敗（存檔壞掉／版本不符／沒有存檔）：false，即使貼圖儲存層可用', () => {
    expect(shouldPruneAfterLoad(false, true)).toBe(false)
  })

  it('貼圖儲存層不可用：false，即使場景還原成功', () => {
    expect(shouldPruneAfterLoad(true, false)).toBe(false)
  })

  it('兩個條件都不成立：false', () => {
    expect(shouldPruneAfterLoad(false, false)).toBe(false)
  })
})

describe('pruneLoadedTextureAssetsAfterLoad：啟動清理只處理本次 IDB 載入的資產', () => {
  beforeEach(() => {
    useSceneStore.getState().clearScene()
    useTextureStore.setState({ assets: {} })
  })

  it('場景還原成功且儲存可用時，只清掉 loaded IDs，保留等待期間新上傳的資產', async () => {
    const loaded = { id: 'loaded-startup', name: 'loaded.png', widthPx: 10, heightPx: 10, blob: new Blob() }
    const uploaded = { id: 'uploaded-startup', name: 'uploaded.png', widthPx: 10, heightPx: 10, blob: new Blob() }
    useTextureStore.setState({ assets: { [loaded.id]: loaded, [uploaded.id]: uploaded } })

    expect(pruneLoadedTextureAssetsAfterLoad(true, true, new Set([loaded.id]))).toBe(true)
    await Promise.resolve()

    expect(useTextureStore.getState().assets[loaded.id]).toBeUndefined()
    expect(useTextureStore.getState().assets[uploaded.id]).toBeDefined()
  })

  it('任一啟動安全閘門不成立時不清理 loaded IDs', async () => {
    const loaded = { id: 'gated-startup', name: 'gated.png', widthPx: 10, heightPx: 10, blob: new Blob() }
    useTextureStore.setState({ assets: { [loaded.id]: loaded } })

    expect(pruneLoadedTextureAssetsAfterLoad(false, true, new Set([loaded.id]))).toBe(false)
    expect(pruneLoadedTextureAssetsAfterLoad(true, false, new Set([loaded.id]))).toBe(false)
    await Promise.resolve()

    expect(useTextureStore.getState().assets[loaded.id]).toBeDefined()
  })
})

describe('loadSavedScene 的回傳值（Residual 1：呼叫端要能分辨「還原成功」與「還原失敗」）', () => {
  let backing: Record<string, string>

  beforeEach(() => {
    useSceneStore.getState().clearScene()
    backing = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in backing ? backing[k] : null),
      setItem: (k: string, v: string) => {
        backing[k] = v
      },
      removeItem: (k: string) => {
        delete backing[k]
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useSceneStore.getState().clearScene()
  })

  it('沒有存檔：回傳 false，場景維持空白', () => {
    expect(loadSavedScene()).toBe(false)
    expect(useSceneStore.getState().objects).toHaveLength(0)
  })

  it('存檔是壞掉的 JSON：回傳 false，場景維持空白', () => {
    backing[SCENE_STORAGE_KEY] = '這不是 JSON'
    expect(loadSavedScene()).toBe(false)
    expect(useSceneStore.getState().objects).toHaveLength(0)
  })

  it('存檔的 version 不符：回傳 false，場景維持空白', () => {
    backing[SCENE_STORAGE_KEY] = JSON.stringify({ version: 999, projectName: 'x', objects: [createObject('boxPlinth')] })
    expect(loadSavedScene()).toBe(false)
    expect(useSceneStore.getState().objects).toHaveLength(0)
  })

  it('localStorage.getItem 拋例外：回傳 false，不拋錯', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('無痕模式或配額問題')
      },
    })
    expect(() => loadSavedScene()).not.toThrow()
    expect(loadSavedScene()).toBe(false)
  })

  it('存檔合法：回傳 true，場景被還原', () => {
    const obj = createObject('boxPlinth')
    backing[SCENE_STORAGE_KEY] = serializeScene([obj], '測試專案')
    expect(loadSavedScene()).toBe(true)
    expect(useSceneStore.getState().objects).toHaveLength(1)
    expect(useSceneStore.getState().projectName).toBe('測試專案')
  })
})

describe('pruneOrphanedTextureAssets（Finding 5：開機時清掉沒有任何 surface 參照的貼圖資產）', () => {
  beforeEach(() => {
    useSceneStore.getState().clearScene()
    useTextureStore.setState({ assets: {} })
  })

  it('清掉沒有被任何物件參照的資產，保留有被參照的', async () => {
    useTextureStore.setState({
      assets: {
        used: { id: 'used', name: 'a.png', widthPx: 10, heightPx: 10, blob: new Blob() },
        orphan: { id: 'orphan', name: 'b.png', widthPx: 10, heightPx: 10, blob: new Blob() },
      },
    })
    const id = useSceneStore.getState().addObject('boxPlinth')
    useSceneStore.getState().setSurface(id, 'front', {
      texture: { assetId: 'used', fit: 'cover', offset: [0, 0], scale: 1, rotation: 0, unlit: false },
    })

    pruneOrphanedTextureAssets()
    // removeAsset 是非同步的（IndexedDB），等一個 microtask 讓它有機會跑完狀態更新
    await Promise.resolve()

    expect(useTextureStore.getState().assets.used).toBeDefined()
    expect(useTextureStore.getState().assets.orphan).toBeUndefined()
  })

  it('空場景時把所有資產都當孤兒清掉', async () => {
    useTextureStore.setState({
      assets: { a: { id: 'a', name: 'a.png', widthPx: 10, heightPx: 10, blob: new Blob() } },
    })
    pruneOrphanedTextureAssets()
    await Promise.resolve()
    expect(useTextureStore.getState().assets.a).toBeUndefined()
  })

  it('移除貼圖後，undo 尚可還原時保留資產', async () => {
    const asset = { id: 'undoable', name: 'undo.png', widthPx: 10, heightPx: 10, blob: new Blob() }
    useTextureStore.setState({ assets: { undoable: asset } })
    const id = useSceneStore.getState().addObject('boxPlinth')
    const texture = { assetId: 'undoable', fit: 'cover' as const, offset: [0, 0] as [number, number], scale: 1, rotation: 0 as const, unlit: false }
    useSceneStore.getState().setSurface(id, 'front', { texture })
    useSceneStore.getState().setSurface(id, 'front', { texture: undefined })

    pruneOrphanedTextureAssets()
    await Promise.resolve()

    expect(useTextureStore.getState().assets.undoable).toBeDefined()
    useSceneStore.getState().undo()
    expect(useSceneStore.getState().objects[0].surfaces.front.texture?.assetId).toBe('undoable')
  })

  it('目前與 past/future 都沒有參照時才清掉資產', async () => {
    const asset = { id: 'released', name: 'released.png', widthPx: 10, heightPx: 10, blob: new Blob() }
    useTextureStore.setState({ assets: { released: asset } })
    const id = useSceneStore.getState().addObject('boxPlinth')
    useSceneStore.getState().setSurface(id, 'front', {
      texture: { assetId: 'released', fit: 'cover', offset: [0, 0], scale: 1, rotation: 0, unlit: false },
    })
    useSceneStore.getState().setSurface(id, 'front', { texture: undefined })

    // 此時 past 還留著可復原的貼圖參照，不能清掉；換成新場景後歷史也清空。
    pruneOrphanedTextureAssets()
    await Promise.resolve()
    expect(useTextureStore.getState().assets.released).toBeDefined()

    useSceneStore.getState().replaceScene([], '新場景')
    pruneOrphanedTextureAssets()
    await Promise.resolve()
    expect(useTextureStore.getState().assets.released).toBeUndefined()
  })

  it('clearScene／replaceScene 後仍以目前歷史狀態判斷，不會刪掉仍被引用的資產', async () => {
    const asset = { id: 'kept', name: 'kept.png', widthPx: 10, heightPx: 10, blob: new Blob() }
    useTextureStore.setState({ assets: { kept: asset } })
    const object = createObject('boxPlinth')
    object.surfaces.front.texture = { assetId: 'kept', fit: 'cover', offset: [0, 0], scale: 1, rotation: 0, unlit: false }
    useSceneStore.getState().replaceScene([object], '有貼圖')

    pruneOrphanedTextureAssets()
    await Promise.resolve()
    expect(useTextureStore.getState().assets.kept).toBeDefined()

    useSceneStore.getState().clearScene()
    pruneOrphanedTextureAssets()
    await Promise.resolve()
    expect(useTextureStore.getState().assets.kept).toBeUndefined()
  })
})

/**
 * `startAutoSave` 的節流計時器只在 Node 測試環境的真實 `window`/`document`/
 * `localStorage` 都不存在，這裡用最小的假物件（真正記錄 listener、能手動
 * dispatch）取代，而不是引入 jsdom——只需要驗證「有沒有呼叫到監聽器」，
 * 不需要真的模擬一整個 DOM。
 */
function createEventStub() {
  const listeners = new Map<string, Set<() => void>>()
  return {
    addEventListener(type: string, cb: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(cb)
    },
    removeEventListener(type: string, cb: () => void) {
      listeners.get(type)?.delete(cb)
    },
    dispatch(type: string) {
      listeners.get(type)?.forEach((cb) => cb())
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0
    },
  }
}

describe('startAutoSave：分頁關閉/隱藏時補寫節流窗內的變更', () => {
  let backing: Record<string, string>
  let windowStub: ReturnType<typeof createEventStub>
  let documentStub: ReturnType<typeof createEventStub> & { visibilityState: 'visible' | 'hidden' }

  beforeEach(() => {
    useSceneStore.getState().clearScene()
    backing = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in backing ? backing[k] : null),
      setItem: (k: string, v: string) => {
        backing[k] = v
      },
      removeItem: (k: string) => {
        delete backing[k]
      },
    })
    windowStub = Object.assign(createEventStub(), {
      setTimeout: ((fn: () => void, ms: number) => setTimeout(fn, ms)) as unknown as Window['setTimeout'],
      clearTimeout: ((id: ReturnType<typeof setTimeout>) => clearTimeout(id)) as unknown as Window['clearTimeout'],
    })
    vi.stubGlobal('window', windowStub)
    documentStub = Object.assign(createEventStub(), { visibilityState: 'visible' as const })
    vi.stubGlobal('document', documentStub)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useSceneStore.getState().clearScene()
  })

  it('pagehide 時若有待處理的節流計時器，立刻同步寫入正確內容（不用等 400ms）', () => {
    const stop = startAutoSave()
    useSceneStore.getState().setProjectName('急救存檔專案')

    // 400ms 節流計時器還沒到，localStorage 應該還是空的
    expect(backing[SCENE_STORAGE_KEY]).toBeUndefined()

    windowStub.dispatch('pagehide')

    const written = JSON.parse(backing[SCENE_STORAGE_KEY])
    expect(written.projectName).toBe('急救存檔專案')

    stop()
  })

  it('visibilitychange 轉成 hidden 時，若有待處理的節流計時器，也會立刻寫入', () => {
    const stop = startAutoSave()
    useSceneStore.getState().setProjectName('背景切換專案')

    expect(backing[SCENE_STORAGE_KEY]).toBeUndefined()

    documentStub.visibilityState = 'hidden'
    documentStub.dispatch('visibilitychange')

    const written = JSON.parse(backing[SCENE_STORAGE_KEY])
    expect(written.projectName).toBe('背景切換專案')

    stop()
  })

  it('沒有待處理的計時器時，pagehide 不會多寫一次', () => {
    const stop = startAutoSave()
    useSceneStore.getState().setProjectName('已經存過的專案')
    windowStub.dispatch('pagehide') // 有待處理計時器 → 這次會寫入
    expect(backing[SCENE_STORAGE_KEY]).toBeDefined()

    delete backing[SCENE_STORAGE_KEY]
    windowStub.dispatch('pagehide') // 沒有新變更、沒有待處理計時器 → 不該再寫

    expect(backing[SCENE_STORAGE_KEY]).toBeUndefined()

    stop()
  })

  it('回傳的清理函式會移除 pagehide 與 visibilitychange 監聽器', () => {
    const stop = startAutoSave()
    expect(windowStub.listenerCount('pagehide')).toBe(1)
    expect(documentStub.listenerCount('visibilitychange')).toBe(1)

    stop()

    expect(windowStub.listenerCount('pagehide')).toBe(0)
    expect(documentStub.listenerCount('visibilitychange')).toBe(0)
  })
})

describe('startAutoSave：貼圖資產跟著場景歷史安全清理', () => {
  let backing: Record<string, string>
  let windowStub: ReturnType<typeof createEventStub>
  let documentStub: ReturnType<typeof createEventStub> & { visibilityState: 'visible' | 'hidden' }

  const asset = (id: string) => ({
    id,
    name: `${id}.png`,
    widthPx: 10,
    heightPx: 10,
    blob: new Blob(),
  })

  beforeEach(() => {
    vi.useFakeTimers()
    useSceneStore.getState().clearScene()
    useTextureStore.setState({ assets: {} })
    backing = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in backing ? backing[k] : null),
      setItem: (k: string, v: string) => {
        backing[k] = v
      },
      removeItem: (k: string) => {
        delete backing[k]
      },
    })
    windowStub = Object.assign(createEventStub(), {
      setTimeout: ((fn: () => void, ms: number) => setTimeout(fn, ms)) as unknown as Window['setTimeout'],
      clearTimeout: ((id: ReturnType<typeof setTimeout>) => clearTimeout(id)) as unknown as Window['clearTimeout'],
    })
    vi.stubGlobal('window', windowStub)
    documentStub = Object.assign(createEventStub(), { visibilityState: 'visible' as const })
    vi.stubGlobal('document', documentStub)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    useTextureStore.setState({ assets: {} })
    useSceneStore.getState().clearScene()
  })

  it('移除貼圖後，past 還能復原，所以 400ms 自動清理仍保留資產', async () => {
    const stored = asset('undo-auto')
    useTextureStore.setState({ assets: { [stored.id]: stored } })
    const object = createObject('boxPlinth')
    object.surfaces.front.texture = { assetId: stored.id, fit: 'cover', offset: [0, 0], scale: 1, rotation: 0, unlit: false }
    useSceneStore.getState().replaceScene([object], '有貼圖')
    const id = useSceneStore.getState().objects[0].id
    const stop = startAutoSave()

    useSceneStore.getState().setSurface(id, 'front', { texture: undefined })
    vi.advanceTimersByTime(400)
    await Promise.resolve()

    expect(useTextureStore.getState().assets[stored.id]).toBeDefined()
    stop()
  })

  it('replaceScene 清空 current/past/future 後，400ms 自動清掉孤兒資產', async () => {
    const stored = asset('replace-auto')
    useTextureStore.setState({ assets: { [stored.id]: stored } })
    const object = createObject('boxPlinth')
    object.surfaces.front.texture = { assetId: stored.id, fit: 'cover', offset: [0, 0], scale: 1, rotation: 0, unlit: false }
    useSceneStore.getState().replaceScene([object], '有貼圖')
    const stop = startAutoSave()

    useSceneStore.getState().replaceScene([], '空場景')
    vi.advanceTimersByTime(400)
    await Promise.resolve()

    expect(useTextureStore.getState().assets[stored.id]).toBeUndefined()
    stop()
  })

  it('新上傳但尚未附加到 surface 的資產，不會在第一次場景變更時被刪除', async () => {
    const existing = asset('existing-auto')
    useTextureStore.setState({ assets: { [existing.id]: existing } })
    const stop = startAutoSave()

    // 模擬使用者在 auto-save 訂閱建立後完成上傳，但尚未呼叫 setSurface。
    const uploaded = asset('uploaded-pending')
    useTextureStore.setState({ assets: { [existing.id]: existing, [uploaded.id]: uploaded } })
    useSceneStore.getState().clearScene()
    vi.advanceTimersByTime(400)
    await Promise.resolve()

    expect(useTextureStore.getState().assets[uploaded.id]).toBeDefined()
    stop()
  })

  it('IndexedDB 資產在 startAutoSave 之後才載入，第一次場景變更仍可清掉既有孤兒', async () => {
    const orphan = asset('loaded-after-start')
    let resolveReady!: (ids: ReadonlySet<string>) => void
    const texturesReady = new Promise<ReadonlySet<string>>((resolve) => {
      resolveReady = resolve
    })
    const stop = startAutoSave(texturesReady)

    useTextureStore.setState({ assets: { [orphan.id]: orphan } })
    resolveReady(new Set([orphan.id]))
    await Promise.resolve()

    useSceneStore.getState().replaceScene([], '第一次載入後變更')
    vi.advanceTimersByTime(400)
    await Promise.resolve()

    expect(useTextureStore.getState().assets[orphan.id]).toBeUndefined()
    stop()
  })
})
