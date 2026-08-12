import { describe, it, expect, afterEach } from 'vitest'
import {
  fitWithinMax,
  validateUpload,
  useTextureStore,
  createTextureBitmap,
  MAX_TEXTURE_PX,
  MAX_UPLOAD_BYTES,
} from './textureStore'

describe('fitWithinMax', () => {
  it('小於上限的圖不動', () => {
    expect(fitWithinMax(800, 600, 2048)).toEqual({ width: 800, height: 600 })
  })

  it('超過上限時等比縮小，長邊等於上限', () => {
    expect(fitWithinMax(4000, 2000, 2048)).toEqual({ width: 2048, height: 1024 })
    expect(fitWithinMax(2000, 4000, 2048)).toEqual({ width: 1024, height: 2048 })
  })

  it('縮小後長寬比誤差在一個像素內', () => {
    const r = fitWithinMax(3333, 1777, 2048)
    expect(Math.abs(r.width / r.height - 3333 / 1777)).toBeLessThan(0.01)
  })

  it('結果永遠是至少 1 的整數', () => {
    const r = fitWithinMax(10000, 3, 2048)
    expect(Number.isInteger(r.width)).toBe(true)
    expect(Number.isInteger(r.height)).toBe(true)
    expect(r.height).toBeGreaterThanOrEqual(1)
  })

  it('退化輸入不產生 NaN', () => {
    for (const [w, h] of [[0, 100], [100, 0], [0, 0]]) {
      const r = fitWithinMax(w, h, 2048)
      expect(Number.isFinite(r.width)).toBe(true)
      expect(Number.isFinite(r.height)).toBe(true)
      expect(r.width).toBeGreaterThanOrEqual(1)
      expect(r.height).toBeGreaterThanOrEqual(1)
    }
  })

  it('上限值就是常數 2048', () => {
    expect(MAX_TEXTURE_PX).toBe(2048)
  })
})

describe('validateUpload', () => {
  const fakeFile = (type: string, size: number, name = 'a.png') =>
    ({ type, size, name }) as File

  it('接受常見圖片格式', () => {
    for (const t of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(validateUpload(fakeFile(t, 1000)).ok).toBe(true)
    }
  })

  it('拒絕非圖片檔並說明原因', () => {
    const r = validateUpload(fakeFile('application/pdf', 1000, 'a.pdf'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('圖片')
  })

  it('拒絕超過 20MB 的檔案並說明原因', () => {
    const r = validateUpload(fakeFile('image/png', MAX_UPLOAD_BYTES + 1))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('20')
  })

  it('剛好 20MB 可以通過', () => {
    expect(validateUpload(fakeFile('image/png', MAX_UPLOAD_BYTES)).ok).toBe(true)
  })

  it('錯誤訊息不含破折號', () => {
    const r = validateUpload(fakeFile('application/pdf', 1000))
    if (!r.ok) expect(r.reason).not.toMatch(/[—–]/)
  })
})

describe('useTextureStore.addFromFile 縱深防禦', () => {
  // 這裡刻意不呼叫任何瀏覽器 API：validateUpload 沒過就必須在
  // 碰到 createImageBitmap（node 環境不存在）之前就丟出中文錯誤訊息。
  const fakeFile = (type: string, size: number, name = 'a.png') =>
    ({ type, size, name }) as File

  it('未經 validateUpload 直接呼叫，非圖片檔會被拒絕並帶原因', async () => {
    await expect(
      useTextureStore.getState().addFromFile(fakeFile('application/pdf', 1000, 'a.pdf')),
    ).rejects.toThrow('圖片')
  })

  it('未經 validateUpload 直接呼叫，超過 20MB 會被拒絕並帶原因', async () => {
    await expect(
      useTextureStore.getState().addFromFile(fakeFile('image/png', MAX_UPLOAD_BYTES + 1)),
    ).rejects.toThrow('20')
  })
})

describe('createTextureBitmap（貼圖垂直翻轉修正）', () => {
  // 根因：Texture.flipY 預設 true，這對 HTMLImageElement 來源有效（three.js
  // 用 UNPACK_FLIP_Y_WEBGL 請 GPU 上傳時反轉），但 WebGL 規格明文規定這個
  // pixel store 參數對 ImageBitmap 來源的 texImage2D 完全不生效。我們的
  // CanvasTexture 一律吃 ImageBitmap（見 makeTexture），flipY 因此形同虛設，
  // 貼圖在畫面上永遠上下顛倒（瀏覽器實測直接看到：正面／背面／左側／右側
  // 四個側面一致上下顛倒，頂面則是前後顛倒——頂面的 v 軸對應深度而非高度，
  // 細節見 SurfaceMaterial.tsx／textureStore.ts 的註解）。
  //
  // 修法是在 createImageBitmap() 解碼當下用 `imageOrientation: 'flipY'`
  // 把列順序反過來，抵銷「GPU 上傳階段的翻轉對 ImageBitmap 不生效」這件事。
  // node 環境沒有 canvas/WebGL，沒辦法真的渲染一張圖出來比對像素上下順序；
  // 能做到、也最貼近根因的驗證方式是鎖住這個回歸：確保實際餵給
  // `makeTexture` 的這個函式一定帶這個選項呼叫 `createImageBitmap`。
  afterEach(() => {
    // 還原成 node 環境原本沒有 createImageBitmap 的狀態，不然會影響
    // 上面「縱深防禦」那組刻意依賴 createImageBitmap 不存在的測試
    // （如果它們排到這組後面執行）。
    delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap
  })

  it('呼叫 createImageBitmap 時帶 imageOrientation: flipY', async () => {
    const calls: Array<{ options?: ImageBitmapOptions }> = []
    const fakeBitmap = { width: 10, height: 10, close: () => {} } as unknown as ImageBitmap
    ;(globalThis as { createImageBitmap?: unknown }).createImageBitmap = (
      _input: unknown,
      options?: ImageBitmapOptions,
    ) => {
      calls.push({ options })
      return Promise.resolve(fakeBitmap)
    }

    const fakeBlob = { type: 'image/png', size: 1000 } as Blob
    const result = await createTextureBitmap(fakeBlob)

    expect(result).toBe(fakeBitmap)
    expect(calls).toHaveLength(1)
    expect(calls[0].options).toEqual({ imageOrientation: 'flipY' })
  })

  it('putAsset（loadAll 也共用同一支 makeTexture 建立路徑）用這個函式解碼，不是原生 createImageBitmap(blob)', async () => {
    const calls: Array<{ options?: ImageBitmapOptions }> = []
    const fakeBitmap = { width: 10, height: 10, close: () => {} } as unknown as ImageBitmap
    ;(globalThis as { createImageBitmap?: unknown }).createImageBitmap = (
      _input: unknown,
      options?: ImageBitmapOptions,
    ) => {
      calls.push({ options })
      return Promise.resolve(fakeBitmap)
    }

    const asset = {
      id: 'tex_fake_1',
      name: 'a.png',
      widthPx: 10,
      heightPx: 10,
      blob: { type: 'image/png', size: 1000 } as Blob,
    }
    await useTextureStore.getState().putAsset(asset)

    const flipYCalls = calls.filter((c) => c.options?.imageOrientation === 'flipY')
    expect(flipYCalls).toHaveLength(1)
  })
})
