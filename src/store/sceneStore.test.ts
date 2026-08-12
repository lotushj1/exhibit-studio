import { describe, it, expect, beforeEach } from 'vitest'
import { useSceneStore } from './sceneStore'

const reset = () => useSceneStore.getState().clearScene()
const s = () => useSceneStore.getState()

describe('sceneStore', () => {
  beforeEach(reset)

  it('新增物件後進入清單並自動選取', () => {
    const id = s().addObject('boxPlinth')
    expect(s().objects).toHaveLength(1)
    expect(s().objects[0].id).toBe(id)
    expect(s().selectedId).toBe(id)
  })

  it('刪除物件後清除選取', () => {
    const id = s().addObject('boxPlinth')
    s().removeObject(id)
    expect(s().objects).toHaveLength(0)
    expect(s().selectedId).toBeNull()
  })

  it('複製物件產生新 id 且位置偏移，原物件不變', () => {
    const id = s().addObject('boxPlinth')
    s().setParam(id, 'widthCm', 200)
    const copyId = s().duplicateObject(id)
    expect(copyId).not.toBe(id)
    expect(s().objects).toHaveLength(2)
    const original = s().objects.find((o) => o.id === id)!
    const copy = s().objects.find((o) => o.id === copyId)!
    expect(copy.params.widthCm).toBe(200)
    expect(copy.transform.position).not.toEqual(original.transform.position)
    // 深拷貝：改複本不影響原件
    s().setParam(copyId!, 'widthCm', 50)
    expect(s().objects.find((o) => o.id === id)!.params.widthCm).toBe(200)
  })

  it('setParam 依 schema 夾在 min 與 max 之間', () => {
    const id = s().addObject('boxPlinth')
    s().setParam(id, 'widthCm', 99999)
    expect(s().objects[0].params.widthCm).toBe(600)
    s().setParam(id, 'widthCm', -50)
    expect(s().objects[0].params.widthCm).toBe(10)
  })

  it('setParam 對未知 key 不做事', () => {
    const id = s().addObject('boxPlinth')
    s().setParam(id, 'notAParam', 1)
    expect(s().objects[0].params.notAParam).toBeUndefined()
  })

  it('setTransform 只改傳入的欄位', () => {
    const id = s().addObject('boxPlinth')
    s().setTransform(id, { rotationY: 1.2 })
    expect(s().objects[0].transform.rotationY).toBe(1.2)
    expect(s().objects[0].transform.position).toEqual([0, 0, 0])
  })

  it('鎖定的物件不能被拖曳改變位置', () => {
    const id = s().addObject('boxPlinth')
    s().toggleLocked(id)
    s().setTransform(id, { position: [5, 0, 5] })
    expect(s().objects[0].transform.position).toEqual([0, 0, 0])
  })

  it('setSurface 只覆蓋傳入欄位', () => {
    const id = s().addObject('boxPlinth')
    s().setSurface(id, 'front', { color: '#112233' })
    expect(s().objects[0].surfaces.front.color).toBe('#112233')
    expect(s().objects[0].surfaces.front.finish).toBe('matte')
  })

  it('undo 還原上一步，redo 再做一次', () => {
    const id = s().addObject('boxPlinth')
    s().setParam(id, 'widthCm', 200)
    expect(s().objects[0].params.widthCm).toBe(200)
    s().undo()
    expect(s().objects[0].params.widthCm).toBe(120)
    s().redo()
    expect(s().objects[0].params.widthCm).toBe(200)
  })

  it('undo 可以還原刪除', () => {
    const id = s().addObject('boxPlinth')
    s().removeObject(id)
    expect(s().objects).toHaveLength(0)
    s().undo()
    expect(s().objects).toHaveLength(1)
  })

  it('沒有歷史時 undo 與 redo 不拋錯', () => {
    expect(() => s().undo()).not.toThrow()
    expect(() => s().redo()).not.toThrow()
    expect(s().objects).toHaveLength(0)
  })

  it('新動作清空 redo 堆疊', () => {
    const id = s().addObject('boxPlinth')
    s().setParam(id, 'widthCm', 200)
    s().undo()
    s().setParam(id, 'widthCm', 300)
    s().redo()
    expect(s().objects[0].params.widthCm).toBe(300)
  })

  it('歷史長度有上限，不會無限成長', () => {
    const id = s().addObject('boxPlinth')
    for (let i = 0; i < 200; i++) s().setParam(id, 'widthCm', 100 + (i % 100))
    expect(s().past.length).toBeLessThanOrEqual(50)
  })

  it('選取與相機視角不進入復原歷史', () => {
    s().addObject('boxPlinth')
    const before = s().past.length
    s().selectObject(null)
    s().setCameraPreset('top')
    expect(s().past.length).toBe(before)
  })

  it('投影模式（正交／透視）不進入復原歷史，比照相機預設', () => {
    s().addObject('boxPlinth')
    const before = s().past.length
    s().setProjection('orthographic')
    expect(s().projection).toBe('orthographic')
    expect(s().past.length).toBe(before)
  })

  it('replaceScene 不覆寫投影模式（比照相機預設，屬於檢視偏好不是場景內容）', () => {
    s().setProjection('orthographic')
    s().replaceScene([], '新專案')
    expect(s().projection).toBe('orthographic')
  })

  it('clearScene 把投影模式重置回預設透視', () => {
    s().setProjection('orthographic')
    s().clearScene()
    expect(s().projection).toBe('perspective')
  })

  it('尺寸標註模式（關閉／選取物件／全部物件）不進入復原歷史，比照相機預設', () => {
    s().addObject('boxPlinth')
    const before = s().past.length
    s().setDimensionMode('all')
    expect(s().dimensionMode).toBe('all')
    s().setDimensionMode('selected')
    expect(s().dimensionMode).toBe('selected')
    expect(s().past.length).toBe(before)
  })

  it('clearScene 把尺寸標註模式重置回預設關閉', () => {
    s().setDimensionMode('all')
    s().clearScene()
    expect(s().dimensionMode).toBe('off')
  })

  it('replaceScene 覆蓋整個場景並清空歷史', () => {
    s().addObject('boxPlinth')
    s().replaceScene([], '新專案')
    expect(s().objects).toHaveLength(0)
    expect(s().projectName).toBe('新專案')
    expect(s().past).toHaveLength(0)
    expect(s().future).toHaveLength(0)
  })

  describe('setSurface 對 texture 參考身分的維護（Task 7 SurfaceMaterial 的 useMemo 相依它）', () => {
    it('只改顏色時，texture 物件參考維持不變', () => {
      const id = s().addObject('boxPlinth')
      s().setSurface(id, 'front', {
        texture: { assetId: 'tex_1', fit: 'cover', offset: [0, 0], scale: 1, rotation: 0, unlit: false },
      })
      const textureBefore = s().objects[0].surfaces.front.texture

      s().setSurface(id, 'front', { color: '#abcdef' })
      const textureAfter = s().objects[0].surfaces.front.texture

      expect(textureAfter).toBe(textureBefore)
    })

    it('改 texture 時，會產生新的物件參考', () => {
      const id = s().addObject('boxPlinth')
      s().setSurface(id, 'front', {
        texture: { assetId: 'tex_1', fit: 'cover', offset: [0, 0], scale: 1, rotation: 0, unlit: false },
      })
      const textureBefore = s().objects[0].surfaces.front.texture

      s().setSurface(id, 'front', {
        texture: { assetId: 'tex_2', fit: 'cover', offset: [0, 0], scale: 1, rotation: 0, unlit: false },
      })
      const textureAfter = s().objects[0].surfaces.front.texture

      expect(textureAfter).not.toBe(textureBefore)
      expect(textureAfter?.assetId).toBe('tex_2')
    })

    it('改動其他物件的位置，不影響另一物件 surface 的 texture 參考（cloneObjects 不應深拷貝未變動的 texture）', () => {
      const id = s().addObject('boxPlinth')
      s().setSurface(id, 'front', {
        texture: { assetId: 'tex_1', fit: 'cover', offset: [0, 0], scale: 1, rotation: 0, unlit: false },
      })
      const textureBefore = s().objects[0].surfaces.front.texture

      const otherId = s().addObject('boxPlinth')
      s().setTransform(otherId, { position: [1, 0, 1] })

      const textureAfter = s().objects.find((o) => o.id === id)!.surfaces.front.texture
      expect(textureAfter).toBe(textureBefore)
    })
  })

  describe('用不存在的 id 呼叫動作不能污染復原歷史', () => {
    const BOGUS_ID = 'does-not-exist'

    it('removeObject 對不存在的 id 是 no-op：past 不變、future 不被清空、objects 不變', () => {
      const id = s().addObject('boxPlinth')
      s().setParam(id, 'widthCm', 200)
      s().undo() // 現在 future 有一筆
      const pastBefore = s().past.length
      const futureBefore = s().future.length
      const objectsBefore = s().objects

      s().removeObject(BOGUS_ID)

      expect(s().past.length).toBe(pastBefore)
      expect(s().future.length).toBe(futureBefore)
      expect(s().objects).toBe(objectsBefore)
    })

    it('setSurface 對不存在的 id 是 no-op：past 不變、future 不被清空、objects 不變', () => {
      const id = s().addObject('boxPlinth')
      s().setParam(id, 'widthCm', 200)
      s().undo()
      const pastBefore = s().past.length
      const futureBefore = s().future.length
      const objectsBefore = s().objects

      s().setSurface(BOGUS_ID, 'front', { color: '#000000' })

      expect(s().past.length).toBe(pastBefore)
      expect(s().future.length).toBe(futureBefore)
      expect(s().objects).toBe(objectsBefore)
    })

    it('renameObject 對不存在的 id 是 no-op：past 不變、future 不被清空、objects 不變', () => {
      const id = s().addObject('boxPlinth')
      s().setParam(id, 'widthCm', 200)
      s().undo()
      const pastBefore = s().past.length
      const futureBefore = s().future.length
      const objectsBefore = s().objects

      s().renameObject(BOGUS_ID, '改名')

      expect(s().past.length).toBe(pastBefore)
      expect(s().future.length).toBe(futureBefore)
      expect(s().objects).toBe(objectsBefore)
    })

    it('toggleVisible 對不存在的 id 是 no-op：past 不變、future 不被清空、objects 不變', () => {
      const id = s().addObject('boxPlinth')
      s().setParam(id, 'widthCm', 200)
      s().undo()
      const pastBefore = s().past.length
      const futureBefore = s().future.length
      const objectsBefore = s().objects

      s().toggleVisible(BOGUS_ID)

      expect(s().past.length).toBe(pastBefore)
      expect(s().future.length).toBe(futureBefore)
      expect(s().objects).toBe(objectsBefore)
    })

    it('toggleLocked 對不存在的 id 是 no-op：past 不變、future 不被清空、objects 不變', () => {
      const id = s().addObject('boxPlinth')
      s().setParam(id, 'widthCm', 200)
      s().undo()
      const pastBefore = s().past.length
      const futureBefore = s().future.length
      const objectsBefore = s().objects

      s().toggleLocked(BOGUS_ID)

      expect(s().past.length).toBe(pastBefore)
      expect(s().future.length).toBe(futureBefore)
      expect(s().objects).toBe(objectsBefore)
    })

    it('真實情境：變更 → undo（future 有東西了）→ 對已刪除的 id 呼叫動作 → redo 仍正確還原', () => {
      const id = s().addObject('boxPlinth')
      s().setParam(id, 'widthCm', 200)
      s().removeObject(id) // 這個 id 現在已經不存在於場景中了
      s().undo() // 復原刪除，objects 又有這個物件，且 widthCm 還是 200；future 裡存著「已刪除」的那個狀態

      // 模擬「介面回呼晚到，對著一個當下已經不存在的 id 觸發動作」：
      // 這裡故意用一個真的不存在的 id（不是 id 本身，因為 undo 後 id 又存在了）
      s().toggleVisible(BOGUS_ID)

      s().redo()
      expect(s().objects).toHaveLength(0) // 重做應該正確前進到「已刪除」的狀態
    })
  })

  it('切換假人體型時身高換成該體型的預設值', () => {
    const id = s().addObject('humanFigure')
    expect(s().objects[0].params.heightCm).toBe(173)
    s().setParam(id, 'build', 'child')
    expect(s().objects[0].params.build).toBe('child')
    expect(s().objects[0].params.heightCm).toBe(120)
  })

  it('sideEffect 產生的參數同樣被夾在範圍內', () => {
    const id = s().addObject('humanFigure')
    s().setParam(id, 'build', 'female')
    const def = s().objects[0].params.heightCm as number
    expect(def).toBeGreaterThanOrEqual(80)
    expect(def).toBeLessThanOrEqual(200)
  })

  describe('setParamLive：拖曳中即時更新畫面，但不進復原歷史', () => {
    it('更新畫面用的 objects，但不推入 past', () => {
      const id = s().addObject('boxPlinth')
      const pastBefore = s().past.length
      s().setParamLive(id, 'widthCm', 250)
      expect(s().objects[0].params.widthCm).toBe(250)
      expect(s().past.length).toBe(pastBefore)
    })

    it('同樣依 schema 夾在 min 與 max 之間', () => {
      const id = s().addObject('boxPlinth')
      s().setParamLive(id, 'widthCm', 99999)
      expect(s().objects[0].params.widthCm).toBe(600)
    })

    it('同樣套用 sideEffect', () => {
      const id = s().addObject('humanFigure')
      s().setParamLive(id, 'build', 'child')
      expect(s().objects[0].params.heightCm).toBe(120)
    })

    it('對不存在的 id 是 no-op：不建立快照、objects 與 past 都不變', () => {
      s().addObject('boxPlinth')
      const objectsBefore = s().objects
      const pastBefore = s().past.length
      s().setParamLive('does-not-exist', 'widthCm', 300)
      expect(s().objects).toBe(objectsBefore)
      expect(s().past.length).toBe(pastBefore)
    })

    it('模擬一次滑桿拖曳：多次 setParamLive 後一次 setParam 提交，只產生一筆歷史，undo 一次回到拖曳前的值', () => {
      const id = s().addObject('boxPlinth')
      const pastBefore = s().past.length

      // 模擬 Radix Slider 拖曳中連續觸發 onValueChange
      s().setParamLive(id, 'widthCm', 150)
      s().setParamLive(id, 'widthCm', 180)
      s().setParamLive(id, 'widthCm', 200)
      expect(s().objects[0].params.widthCm).toBe(200) // 畫面已經即時跟著變
      expect(s().past.length).toBe(pastBefore) // 但拖曳中完全沒有進歷史

      // 放開滑桿，觸發 onValueCommit
      s().setParam(id, 'widthCm', 200)
      expect(s().past.length).toBe(pastBefore + 1) // 整段拖曳只算一筆歷史
      expect(s().objects[0].params.widthCm).toBe(200)

      s().undo()
      expect(s().objects[0].params.widthCm).toBe(120) // 一次就退回拖曳前的原始值，不是拖曳中的中間值
    })

    it('移動物件 → 拖一次尺寸滑桿 → 移動物件，連續 undo 三次分別退回三個步驟，互不干擾', () => {
      const id = s().addObject('boxPlinth')

      s().setTransform(id, { position: [1, 0, 1] })

      s().setParamLive(id, 'widthCm', 150)
      s().setParamLive(id, 'widthCm', 200)
      s().setParam(id, 'widthCm', 200)

      s().setTransform(id, { position: [2, 0, 2] })

      s().undo()
      expect(s().objects[0].transform.position).toEqual([1, 0, 1])
      expect(s().objects[0].params.widthCm).toBe(200)

      s().undo()
      expect(s().objects[0].params.widthCm).toBe(120)
      expect(s().objects[0].transform.position).toEqual([1, 0, 1])

      s().undo()
      expect(s().objects[0].transform.position).toEqual([0, 0, 0])
    })
  })

  describe('被放棄的拖曳手勢：liveSnapshot 不會被不相干的 commit 吃掉（code review 抓出的問題）', () => {
    it('拖曳物件 A 的寬度（只有 live，從未 commit）→ 改物件 B 的名字：past 增加兩筆，分別 undo 回 B 改名前與 A 拖曳前', () => {
      const idA = s().addObject('boxPlinth')
      const idB = s().addObject('boxPlinth')
      const pastBefore = s().past.length

      // A 的拖曳只有 live 更新，從未呼叫 setParam 收尾（onValueCommit 沒有觸發：
      // 使用者切分頁、視窗失焦、或指標捕獲丟失都可能發生這種情況）。
      s().setParamLive(idA, 'widthCm', 200)
      s().setParamLive(idA, 'widthCm', 250)
      expect(s().objects.find((o) => o.id === idA)!.params.widthCm).toBe(250)
      expect(s().past.length).toBe(pastBefore) // 拖曳中還是不進歷史

      // 這時使用者改去做一件完全不相干的事：改 B 的名字。
      s().renameObject(idB, '新名字')

      // 被放棄的 A 拖曳必須先被結算成它自己獨立的一筆，B 改名再算一筆——總共兩筆，
      // 不是被 B 改名的 commit 吃成一筆。
      expect(s().past.length).toBe(pastBefore + 2)
      expect(s().objects.find((o) => o.id === idB)!.name).toBe('新名字')
      expect(s().objects.find((o) => o.id === idA)!.params.widthCm).toBe(250) // A 的拖曳值仍然生效

      // 第一次 undo：只退掉 B 的改名，A 的寬度不受影響。
      s().undo()
      expect(s().objects.find((o) => o.id === idB)!.name).not.toBe('新名字')
      expect(s().objects.find((o) => o.id === idA)!.params.widthCm).toBe(250)

      // 第二次 undo：才退掉 A 被放棄的拖曳，回到拖曳前的原始寬度。
      s().undo()
      expect(s().objects.find((o) => o.id === idA)!.params.widthCm).toBe(120)
    })

    it('拖曳物件 A 的寬度（只有 live）→ 開始拖 A 的另一個參數（girth 不適用於 boxPlinth，改用 depthCm）：前一段手勢被結算成獨立一筆', () => {
      const idA = s().addObject('boxPlinth')
      const pastBefore = s().past.length

      s().setParamLive(idA, 'widthCm', 200)
      s().setParamLive(idA, 'widthCm', 250)
      expect(s().past.length).toBe(pastBefore)

      // 换成拖同一個物件的「另一個」參數，代表寬度那段手勢被放棄了。
      s().setParamLive(idA, 'depthCm', 80)
      expect(s().past.length).toBe(pastBefore + 1) // 寬度手勢被結算成獨立一筆
      expect(s().objects[0].params.widthCm).toBe(250) // 結算時保留放棄當下的值
      expect(s().objects[0].params.depthCm).toBe(80) // 深度的即時更新也生效

      // 深度手勢正常收尾。
      s().setParam(idA, 'depthCm', 80)
      expect(s().past.length).toBe(pastBefore + 2)

      s().undo()
      expect(s().objects[0].params.depthCm).toBe(60) // 退回深度手勢開始前（也就是寬度結算之後）的值
      expect(s().objects[0].params.widthCm).toBe(250)

      s().undo()
      expect(s().objects[0].params.widthCm).toBe(120) // 退回寬度手勢開始前的原始值
    })

    it('拖曳物件 A 的寬度（只有 live）→ 拖曳物件 B 的寬度：前一段手勢被結算成獨立一筆', () => {
      const idA = s().addObject('boxPlinth')
      const idB = s().addObject('boxPlinth')
      const pastBefore = s().past.length

      s().setParamLive(idA, 'widthCm', 200)
      s().setParamLive(idA, 'widthCm', 250)
      expect(s().past.length).toBe(pastBefore)

      // 換成拖另一個物件 B 的寬度，代表 A 那段手勢被放棄了。
      s().setParamLive(idB, 'widthCm', 300)
      expect(s().past.length).toBe(pastBefore + 1) // A 的手勢被結算成獨立一筆
      expect(s().objects.find((o) => o.id === idA)!.params.widthCm).toBe(250)
      expect(s().objects.find((o) => o.id === idB)!.params.widthCm).toBe(300)

      s().setParam(idB, 'widthCm', 300)
      expect(s().past.length).toBe(pastBefore + 2)

      s().undo()
      expect(s().objects.find((o) => o.id === idB)!.params.widthCm).toBe(120) // 退回 B 手勢開始前
      expect(s().objects.find((o) => o.id === idA)!.params.widthCm).toBe(250)

      s().undo()
      expect(s().objects.find((o) => o.id === idA)!.params.widthCm).toBe(120) // 退回 A 手勢開始前
    })
  })

  describe('setTransform live：地面拖曳中即時更新位置，但不進復原歷史（Task 16）', () => {
    it('live 更新畫面用的 position，但不推入 past', () => {
      const id = s().addObject('boxPlinth')
      const pastBefore = s().past.length
      s().setTransform(id, { position: [1, 0, 1] }, { live: true })
      expect(s().objects[0].transform.position).toEqual([1, 0, 1])
      expect(s().past.length).toBe(pastBefore)
    })

    it('對不存在的 id 是 no-op：不建立快照、objects 與 past 都不變', () => {
      s().addObject('boxPlinth')
      const objectsBefore = s().objects
      const pastBefore = s().past.length
      s().setTransform('does-not-exist', { position: [1, 0, 1] }, { live: true })
      expect(s().objects).toBe(objectsBefore)
      expect(s().past.length).toBe(pastBefore)
    })

    it('鎖定的物件呼叫 live 版本也不會被搬動', () => {
      const id = s().addObject('boxPlinth')
      s().toggleLocked(id)
      const pastBefore = s().past.length
      s().setTransform(id, { position: [5, 0, 5] }, { live: true })
      expect(s().objects[0].transform.position).toEqual([0, 0, 0])
      expect(s().past.length).toBe(pastBefore)
    })

    it('模擬一次拖曳：多次 live 呼叫後一次非 live 呼叫收尾，只產生一筆歷史，undo 一次回到拖曳前的位置', () => {
      const id = s().addObject('boxPlinth')
      const pastBefore = s().past.length

      // 模擬 pointermove 連續觸發
      s().setTransform(id, { position: [0.3, 0, 0.1] }, { live: true })
      s().setTransform(id, { position: [0.6, 0, 0.2] }, { live: true })
      s().setTransform(id, { position: [1, 0, 0.4] }, { live: true })
      expect(s().objects[0].transform.position).toEqual([1, 0, 0.4]) // 畫面已經即時跟著變
      expect(s().past.length).toBe(pastBefore) // 拖曳中完全沒有進歷史

      // 放開滑鼠，收尾
      s().setTransform(id, { position: [1, 0, 0.4] })
      expect(s().past.length).toBe(pastBefore + 1) // 整段拖曳只算一筆歷史
      expect(s().objects[0].transform.position).toEqual([1, 0, 0.4])

      s().undo()
      expect(s().objects[0].transform.position).toEqual([0, 0, 0]) // 一次就退回拖曳前的原始位置，不是拖曳中的中間值
    })

    it('拖一次位置 → 改一次尺寸滑桿 → 再拖一次位置，連續 undo 三次分別退回三個步驟，互不干擾', () => {
      const id = s().addObject('boxPlinth')

      s().setTransform(id, { position: [0.5, 0, 0.5] }, { live: true })
      s().setTransform(id, { position: [1, 0, 1] }, { live: true })
      s().setTransform(id, { position: [1, 0, 1] })

      s().setParamLive(id, 'widthCm', 150)
      s().setParamLive(id, 'widthCm', 200)
      s().setParam(id, 'widthCm', 200)

      s().setTransform(id, { position: [2, 0, 2] }, { live: true })
      s().setTransform(id, { position: [2, 0, 2] })

      s().undo()
      expect(s().objects[0].transform.position).toEqual([1, 0, 1])
      expect(s().objects[0].params.widthCm).toBe(200)

      s().undo()
      expect(s().objects[0].params.widthCm).toBe(120)
      expect(s().objects[0].transform.position).toEqual([1, 0, 1])

      s().undo()
      expect(s().objects[0].transform.position).toEqual([0, 0, 0])
    })
  })

  describe('被放棄的拖曳手勢（transform）：liveSnapshot 不會被不相干的 commit 吃掉（Task 16，同 Task 15 setParamLive 的中斷情境）', () => {
    it('拖曳物件 A 的位置（只有 live，從未收尾）→ 改物件 B 的名字：past 增加兩筆，分別 undo 回 B 改名前與 A 拖曳前', () => {
      const idA = s().addObject('boxPlinth')
      const idB = s().addObject('boxPlinth')
      const pastBefore = s().past.length

      // A 的拖曳只有 live 更新，從未呼叫非 live 的 setTransform 收尾——
      // 模擬指標離開視窗、切分頁等中斷情境：onPointerUp 沒有機會觸發。
      s().setTransform(idA, { position: [1, 0, 1] }, { live: true })
      s().setTransform(idA, { position: [2, 0, 2] }, { live: true })
      expect(s().objects.find((o) => o.id === idA)!.transform.position).toEqual([2, 0, 2])
      expect(s().past.length).toBe(pastBefore) // 拖曳中還是不進歷史

      // 使用者回來後改去做一件完全不相干的事：改 B 的名字。
      s().renameObject(idB, '新名字')

      // 被放棄的 A 拖曳必須先被結算成它自己獨立的一筆，B 改名再算一筆——
      // 總共兩筆，不是被 B 改名的 commit 吃成一筆。
      expect(s().past.length).toBe(pastBefore + 2)
      expect(s().objects.find((o) => o.id === idB)!.name).toBe('新名字')
      expect(s().objects.find((o) => o.id === idA)!.transform.position).toEqual([2, 0, 2]) // A 的拖曳值仍然生效

      s().undo()
      expect(s().objects.find((o) => o.id === idB)!.name).not.toBe('新名字')
      expect(s().objects.find((o) => o.id === idA)!.transform.position).toEqual([2, 0, 2])

      s().undo()
      expect(s().objects.find((o) => o.id === idA)!.transform.position).toEqual([0, 0, 0]) // 回到拖曳前的原始位置
    })

    it('拖曳物件 A 的位置（只有 live）→ 物件 A 被刪除：拖曳先結算成獨立一筆，刪除再算一筆，undo 兩次可回到刪除前、拖曳前', () => {
      const idA = s().addObject('boxPlinth')
      const pastBefore = s().past.length

      s().setTransform(idA, { position: [1, 0, 1] }, { live: true })
      expect(s().past.length).toBe(pastBefore)

      s().removeObject(idA)

      expect(s().past.length).toBe(pastBefore + 2)
      expect(s().objects).toHaveLength(0)

      s().undo() // 復原刪除
      expect(s().objects.find((o) => o.id === idA)!.transform.position).toEqual([1, 0, 1])

      s().undo() // 復原拖曳，回到原始位置
      expect(s().objects.find((o) => o.id === idA)!.transform.position).toEqual([0, 0, 0])
    })

    it('拖曳物件 A 的位置（只有 live）→ 拖曳同一物件的寬度參數（不同手勢 key）：前一段搬移手勢被結算成獨立一筆', () => {
      const idA = s().addObject('boxPlinth')
      const pastBefore = s().past.length

      s().setTransform(idA, { position: [1, 0, 1] }, { live: true })
      expect(s().past.length).toBe(pastBefore)

      // 換成拖同一個物件的尺寸滑桿，代表搬移那段手勢被放棄了（保留字
      // 'transform.position' 跟參數 key 'widthCm' 不會撞在一起）。
      s().setParamLive(idA, 'widthCm', 200)
      expect(s().past.length).toBe(pastBefore + 1) // 搬移手勢被結算成獨立一筆
      expect(s().objects[0].transform.position).toEqual([1, 0, 1]) // 結算時保留放棄當下的位置
      expect(s().objects[0].params.widthCm).toBe(200)

      s().setParam(idA, 'widthCm', 200)
      expect(s().past.length).toBe(pastBefore + 2)

      s().undo()
      expect(s().objects[0].params.widthCm).toBe(120) // 退回寬度手勢開始前（也就是搬移結算之後）的值
      expect(s().objects[0].transform.position).toEqual([1, 0, 1])

      s().undo()
      expect(s().objects[0].transform.position).toEqual([0, 0, 0]) // 退回搬移手勢開始前的原始位置
    })
  })

  describe('Task 16 code review 修正：undo/redo 結算懸掛手勢、位置與角度分開的手勢 key', () => {
    it('live 拖曳從未收尾（模擬中斷）→ 直接 undo：退回的是拖曳前的位置，不是更早的操作', () => {
      const id = s().addObject('boxPlinth')
      s().setTransform(id, { position: [3, 0, 3] }) // 一筆「更早的操作」，先確立一個基準點
      const pastBefore = s().past.length

      // 拖曳只呼叫過 live 版本，從未呼叫非 live 版本收尾（例如視窗失焦、
      // 元件卸載時 window 監聽補跑了 finishDrag 但 store 這層本身無法得知——
      // 這裡直接模擬「liveSnapshot 掛著、下一步就是使用者按 Cmd+Z」）。
      s().setTransform(id, { position: [1, 0, 1] }, { live: true })
      s().setTransform(id, { position: [-2.64, 0, -0.48] }, { live: true })
      expect(s().objects[0].transform.position).toEqual([-2.64, 0, -0.48])
      expect(s().past.length).toBe(pastBefore) // 拖曳中仍未進歷史

      s().undo()

      // 退回的必須是拖曳前的位置 [3, 0, 3]，不是再更早的 [0, 0, 0]。
      // （懸掛的手勢先被結算成獨立一筆 pastBefore+1，undo 再把它退掉，
      // 淨結果 past.length 回到 pastBefore。）
      expect(s().objects[0].transform.position).toEqual([3, 0, 3])
      expect(s().past.length).toBe(pastBefore)

      // 再 undo 一次，才退回最早新增物件時的原始位置。
      s().undo()
      expect(s().objects[0].transform.position).toEqual([0, 0, 0])
    })

    it('live 拖曳從未收尾 → 直接 redo（無懸掛以外的 future）：手勢被結算，不會憑空冒出多餘的重做', () => {
      const id = s().addObject('boxPlinth')
      const pastBefore = s().past.length

      s().setTransform(id, { position: [1, 0, 1] }, { live: true })
      expect(s().past.length).toBe(pastBefore)

      s().redo()

      // 結算成一筆獨立歷史，位置維持拖曳當下的值；沒有 future 可重做，
      // 也不會遺失或錯誤還原這段拖曳。
      expect(s().past.length).toBe(pastBefore + 1)
      expect(s().objects[0].transform.position).toEqual([1, 0, 1])

      s().undo()
      expect(s().objects[0].transform.position).toEqual([0, 0, 0])
    })

    it('位置手勢未結算時改同一物件的角度：產生兩筆獨立歷史，不會被誤判成同一段拖曳的收尾', () => {
      const id = s().addObject('boxPlinth')
      const pastBefore = s().past.length

      // 拖曳位置到一半，liveSnapshot 掛著（key = 'transform.position'）。
      s().setTransform(id, { position: [1, 0, 1] }, { live: true })
      expect(s().past.length).toBe(pastBefore)

      // 這時使用者從屬性面板改角度（非 live，key 若跟位置共用會被誤判成
      // 「收尾剛剛那段位置拖曳」，把兩個獨立操作合併成一筆）。
      s().setTransform(id, { rotationY: 1.2 })

      // 必須是兩筆：位置手勢被結算成獨立一筆，角度變更再算一筆。
      expect(s().past.length).toBe(pastBefore + 2)
      expect(s().objects[0].transform.position).toEqual([1, 0, 1])
      expect(s().objects[0].transform.rotationY).toBe(1.2)

      // 分兩步退回：先退角度，位置維持拖曳後的值。
      s().undo()
      expect(s().objects[0].transform.rotationY).toBe(0)
      expect(s().objects[0].transform.position).toEqual([1, 0, 1])

      // 再退位置，回到拖曳前的原始位置。
      s().undo()
      expect(s().objects[0].transform.position).toEqual([0, 0, 0])
    })
  })

  describe('setSurface live：貼圖手勢中即時更新畫面，但不進復原歷史（Task 18，比照 Task 16 的 setTransform live）', () => {
    it('live 更新畫面用的 surface，但不推入 past', () => {
      const id = s().addObject('boxPlinth')
      const pastBefore = s().past.length
      s().setSurface(id, 'front', { color: '#112233' }, { live: true })
      expect(s().objects[0].surfaces.front.color).toBe('#112233')
      expect(s().past.length).toBe(pastBefore)
    })

    it('對不存在的 id 是 no-op：不建立快照、objects 與 past 都不變', () => {
      s().addObject('boxPlinth')
      const objectsBefore = s().objects
      const pastBefore = s().past.length
      s().setSurface('does-not-exist', 'front', { color: '#112233' }, { live: true })
      expect(s().objects).toBe(objectsBefore)
      expect(s().past.length).toBe(pastBefore)
    })

    it('模擬一次貼圖滑桿拖曳：多次 live 呼叫後一次非 live 呼叫收尾，只產生一筆歷史，undo 一次回到拖曳前（貼圖消失、顏色還原）', () => {
      const id = s().addObject('boxPlinth')
      const pastBefore = s().past.length
      const originalColor = s().objects[0].surfaces.front.color

      // 模擬平鋪大小滑桿連續觸發 onValueChange
      s().setSurface(
        id, 'front',
        { texture: { assetId: 'tex_a', fit: 'repeat', offset: [0, 0], scale: 1, rotation: 0, unlit: false } },
        { live: true },
      )
      s().setSurface(
        id, 'front',
        { texture: { assetId: 'tex_a', fit: 'repeat', offset: [0.1, 0], scale: 1.5, rotation: 0, unlit: false } },
        { live: true },
      )
      expect(s().objects[0].surfaces.front.texture?.scale).toBe(1.5) // 畫面已經即時跟著變
      expect(s().past.length).toBe(pastBefore) // 拖曳中完全沒有進歷史

      // 放開滑鼠，onValueCommit 收尾
      s().setSurface(
        id, 'front',
        { texture: { assetId: 'tex_a', fit: 'repeat', offset: [0.1, 0], scale: 1.5, rotation: 0, unlit: false } },
      )
      expect(s().past.length).toBe(pastBefore + 1) // 整段拖曳只算一筆歷史

      s().undo()
      // 一次就退回拖曳前：沒有貼圖，顏色是原本的預設值
      expect(s().objects[0].surfaces.front.texture).toBeUndefined()
      expect(s().objects[0].surfaces.front.color).toBe(originalColor)
    })

    it('不同面各自是獨立手勢：拖曳 front（只有 live，從未收尾）→ 拖曳 left：front 的手勢先被結算成獨立一筆', () => {
      const id = s().addObject('boxPlinth')
      const pastBefore = s().past.length

      s().setSurface(id, 'front', { color: '#111111' }, { live: true })
      expect(s().past.length).toBe(pastBefore)

      s().setSurface(id, 'left', { color: '#222222' }, { live: true })
      expect(s().past.length).toBe(pastBefore + 1) // front 的手勢被結算成獨立一筆
      expect(s().objects[0].surfaces.front.color).toBe('#111111')
      expect(s().objects[0].surfaces.left.color).toBe('#222222') // left 這段拖曳本身仍未進歷史（跟 front 那筆分開）
    })

    it('被放棄的拖曳手勢：拖曳 front（只有 live，從未收尾）→ 改物件名稱：past 增加兩筆，分別 undo 回改名前與拖曳前', () => {
      const id = s().addObject('boxPlinth')
      const originalColor = s().objects[0].surfaces.front.color
      const pastBefore = s().past.length

      s().setSurface(id, 'front', { color: '#333333' }, { live: true })
      expect(s().past.length).toBe(pastBefore)

      s().renameObject(id, '新名字')
      expect(s().past.length).toBe(pastBefore + 2)

      s().undo()
      expect(s().objects[0].name).not.toBe('新名字')
      expect(s().objects[0].surfaces.front.color).toBe('#333333')

      s().undo()
      expect(s().objects[0].surfaces.front.color).toBe(originalColor)
    })

    it('live 拖曳從未收尾 → 直接 undo：退回的是拖曳前的顏色（Task 16 的 undo 先結算懸掛手勢機制，自動套用到 surface）', () => {
      const id = s().addObject('boxPlinth')
      const originalColor = s().objects[0].surfaces.front.color
      const pastBefore = s().past.length

      s().setSurface(id, 'front', { color: '#444444' }, { live: true })
      s().setSurface(id, 'front', { color: '#555555' }, { live: true })
      expect(s().past.length).toBe(pastBefore)

      s().undo()
      expect(s().objects[0].surfaces.front.color).toBe(originalColor)
      expect(s().past.length).toBe(pastBefore)
    })
  })

  describe('Finding 1：沒有實際變更的呼叫不進歷史（點入欄位又點走、點一下滑桿不拖曳）', () => {
    it('setParam 傳入跟目前值相同的數字：past 不變，future 也沒有被清空', () => {
      const id = s().addObject('boxPlinth')
      s().setParam(id, 'widthCm', 200)
      s().undo() // widthCm 現在是 120，future 裡有一筆「200」可以重做
      const pastBefore = s().past.length
      const futureBefore = s().future.length
      expect(futureBefore).toBeGreaterThan(0)

      // 模擬「點進寬度欄位、什麼都沒打就點走」或「點一下滑桿 thumb 沒拖動」：
      // onCommit/onValueCommit 帶的是目前已經生效的值。
      s().setParam(id, 'widthCm', 120)

      expect(s().past.length).toBe(pastBefore)
      expect(s().future.length).toBe(futureBefore)
      // redo 仍然有效，沒有因為這次無意義的呼叫被清空
      s().redo()
      expect(s().objects[0].params.widthCm).toBe(200)
    })

    it('setTransform 傳入跟目前值相同的位置：past 不變，future 也沒有被清空', () => {
      const id = s().addObject('boxPlinth')
      s().setTransform(id, { position: [1, 0, 1] })
      s().undo()
      const pastBefore = s().past.length
      const futureBefore = s().future.length
      expect(futureBefore).toBeGreaterThan(0)

      s().setTransform(id, { position: [0, 0, 0] }) // 目前的位置本來就是 [0,0,0]

      expect(s().past.length).toBe(pastBefore)
      expect(s().future.length).toBe(futureBefore)
    })

    it('setSurface 傳入一個不存在的 surfaceId：past 不變、future 不被清空（Task 12 deferred minor）', () => {
      const id = s().addObject('boxPlinth')
      s().setParam(id, 'widthCm', 200)
      s().undo()
      const pastBefore = s().past.length
      const futureBefore = s().future.length

      s().setSurface(id, 'notARealSurface', { color: '#000000' })

      expect(s().past.length).toBe(pastBefore)
      expect(s().future.length).toBe(futureBefore)
    })

    it('renameObject 傳入跟目前相同的名稱：past 不變（保護未來所有呼叫端，不只 ObjectListRow 自己的 guard）', () => {
      const id = s().addObject('boxPlinth')
      const name = s().objects[0].name
      const pastBefore = s().past.length

      s().renameObject(id, name)

      expect(s().past.length).toBe(pastBefore)
    })
  })

  describe('setTransform 防呆：不支援同時傳入 position 與 rotationY', () => {
    it('同時傳兩者會 throw，避免被靜默歸類成錯的手勢 key', () => {
      const id = s().addObject('boxPlinth')
      expect(() => s().setTransform(id, { position: [1, 0, 1], rotationY: 1 })).toThrow()
    })
  })

  describe('setProjectName 不進復原歷史（順帶項：projectName 已從 Snapshot 移除）', () => {
    it('改名稱之後對不相干的操作按復原，專案名稱不會被還原', () => {
      const id = s().addObject('boxPlinth')
      s().setProjectName('新專案名稱')
      s().setTransform(id, { position: [1, 0, 1] })

      s().undo() // 應該只退掉搬移，不動專案名稱
      expect(s().objects[0].transform.position).toEqual([0, 0, 0])
      expect(s().projectName).toBe('新專案名稱')
    })

    it('setProjectName 本身不會推進 past', () => {
      const pastBefore = s().past.length
      s().setProjectName('打字打到一半')
      expect(s().past.length).toBe(pastBefore)
    })
  })

  describe('duplicateObject 的 id 產生方式', () => {
    it('連續呼叫多次時，每個複本的 id 都不重複', () => {
      const id = s().addObject('boxPlinth')
      const ids = new Set<string>()
      for (let i = 0; i < 20; i++) {
        const copyId = s().duplicateObject(id)
        expect(copyId).not.toBeNull()
        expect(ids.has(copyId!)).toBe(false)
        ids.add(copyId!)
      }
      expect(ids.size).toBe(20)
    })
  })
})
