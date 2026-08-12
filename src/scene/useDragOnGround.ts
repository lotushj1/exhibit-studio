import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useSceneStore } from '../store/sceneStore'
import { applyDrag } from './dragMath'

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

/**
 * 在 y=0 的地面平面上拖曳物件。
 * 拖曳期間停用 OrbitControls，避免鏡頭跟著轉。
 *
 * 過程中每個 `pointermove` 都呼叫 `setTransform(..., { live: true })`——
 * 走 sceneStore 的即時手勢機制，完全不進復原歷史；放開滑鼠時呼叫一次
 * 不帶 `live` 的 `setTransform` 收尾，兩者用同一個物件 id，讓 store 認出
 * 這是同一段手勢的結尾，只推一筆歷史，undo 一次就退回拖曳前的位置。
 *
 * `dragging`/`lastPos` 是 module 外層看不到、每個物件各自一份的 ref，
 * 不需要（也不應該）觸發 React 重新渲染。
 */
export function useDragOnGround(objectId: string, locked: boolean) {
  const { camera, raycaster, controls } = useThree()
  const setTransform = useSceneStore((s) => s.setTransform)
  const selectObject = useSceneStore((s) => s.selectObject)

  const dragging = useRef(false)
  const startPos = useRef<[number, number, number]>([0, 0, 0])
  const grabPoint = useRef(new THREE.Vector3())
  const lastPos = useRef<[number, number, number]>([0, 0, 0])

  const hitGround = (event: ThreeEvent<PointerEvent>): THREE.Vector3 | null => {
    raycaster.setFromCamera(event.pointer, camera)
    const point = new THREE.Vector3()
    return raycaster.ray.intersectPlane(GROUND, point) ? point : null
  }

  const finishDrag = () => {
    if (!dragging.current) return
    dragging.current = false
    if (controls) (controls as unknown as { enabled: boolean }).enabled = true
    // 用同一個 id 呼叫非 live 版本收尾：store 認出這是剛剛那段手勢的結尾，
    // 用手勢前的快照當歷史基準，只推一筆歷史。
    setTransform(objectId, { position: lastPos.current })
  }

  /**
   * 保險絲：`setPointerCapture` 理論上能保證放開滑鼠時、即使指標已經離開
   * 畫布邊界，`pointerup` 還是會送到原本抓著它的元素上。但「切分頁」
   * （visibilitychange/blur，事件根本不會送到任何 DOM 元素）跟某些瀏覽器
   * 對「放開時指標已經在視窗外」的邊界情況，不能完全保證一定會補發
   * `pointerup`/`pointercancel`。這裡在 window 層再掛一份 `pointerup`／
   * `pointercancel`／`blur` 監聽，任何一個觸發時如果手勢還「掛著」
   * （`dragging.current` 為 true）就強制收尾——確保拖曳中斷時，這段手勢
   * 一定會被結算成一筆獨立歷史，不會被使用者回來後的下一個操作吃掉。
   * 正常放開滑鼠時，本地 `onPointerUp` 會先跑、把 `dragging.current` 設回
   * false，這裡的監聽再觸發時就是 no-op，不會重複收尾。
   */
  useEffect(() => {
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', finishDrag)
    window.addEventListener('blur', finishDrag)
    return () => {
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', finishDrag)
      window.removeEventListener('blur', finishDrag)
    }
  }, [objectId, controls])

  /**
   * `finishDrag` 一路帶著目前渲染的 `controls`/`setTransform` 閉包，每次渲染
   * 都是新的函式實體。下面的 unmount-only effect 要在元件卸載時呼叫「最新」
   * 的 `finishDrag`，所以每次渲染都把它同步存進這個 ref——effect 本身用空
   * 依賴陣列只掛載/卸載一次，cleanup 讀 ref 時永遠拿得到最後一次渲染的版本。
   */
  const finishDragRef = useRef(finishDrag)
  finishDragRef.current = finishDrag

  /**
   * 保險絲：如果這個 `ObjectNode` 在 `dragging.current` 還是 `true` 的時候
   * 被卸載（例如物件被刪除——Task 19 會加 Delete 快捷鍵，讓「拖著物件同時
   * 按 Delete」變成使用者真的做得到的操作），`onPointerDown` 設下的
   * `controls.enabled = false` 就再也沒有機會被設回 `true`，鏡頭會永久卡死
   * 轉不動。這裡在卸載時強制呼叫 `finishDrag`：把 `controls.enabled` 設回
   * `true`，並讓這段手勢正常結算成一筆獨立歷史（而不是留著一個永遠不會被
   * 結算的 `liveSnapshot`）。
   *
   * 用空依賴陣列，讓這個 effect 只在卸載時執行一次 cleanup，不會被
   * `objectId`/`controls` 這些跟拖曳中斷本身無關的依賴變化提早觸發。
   */
  useEffect(() => {
    return () => {
      if (dragging.current) {
        finishDragRef.current()
      }
    }
  }, [])

  return {
    onPointerDown(event: ThreeEvent<PointerEvent>) {
      /* 只接主鍵。中鍵要留給 OrbitControls 轉視角、右鍵要留給平移，所以其他
       * 鍵一律直接放行，而且**不能** stopPropagation，否則事件到不了
       * OrbitControls，中鍵按在物件上就轉不動。也不選取物件——中鍵按下去
       * 的意圖是轉鏡頭，不是選東西。 */
      if (event.button !== 0) return
      event.stopPropagation()
      selectObject(objectId)
      if (locked) return
      const point = hitGround(event)
      if (!point) return
      const current = useSceneStore.getState().objects.find((o) => o.id === objectId)
      if (!current) return
      dragging.current = true
      startPos.current = [...current.transform.position] as [number, number, number]
      lastPos.current = startPos.current
      grabPoint.current.copy(point)
      ;(event.target as Element).setPointerCapture?.(event.pointerId)
      if (controls) (controls as unknown as { enabled: boolean }).enabled = false
    },

    onPointerMove(event: ThreeEvent<PointerEvent>) {
      if (!dragging.current) return
      event.stopPropagation()
      const point = hitGround(event)
      if (!point) return
      const next = applyDrag(
        startPos.current,
        [point.x - grabPoint.current.x, point.z - grabPoint.current.z],
        event.shiftKey,
      )
      lastPos.current = next
      setTransform(objectId, { position: next }, { live: true })
    },

    onPointerUp(event: ThreeEvent<PointerEvent>) {
      if (!dragging.current) return
      ;(event.target as Element).releasePointerCapture?.(event.pointerId)
      finishDrag()
    },

    onPointerCancel(event: ThreeEvent<PointerEvent>) {
      if (!dragging.current) return
      ;(event.target as Element).releasePointerCapture?.(event.pointerId)
      finishDrag()
    },
  }
}
