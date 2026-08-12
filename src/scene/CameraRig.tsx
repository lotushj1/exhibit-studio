import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useSceneStore } from '../store/sceneStore'
import {
  CAMERA_TRANSITION_CANCEL_EVENT,
  framePreset,
  orthoZoomForFrame,
} from './cameraPresets'

const TRANSITION_MS = 600

/**
 * 正交相機的 `zoom` 補間用幾何（等比）插值，不是線性插值。
 *
 * 瀏覽器實測時發現的問題：`zoom` 本質是「放大倍率」，主視角這類預設在
 * 大場景下 `fromZoom`（掛載時的 1）跟 `toZoom`（框住整個場景需要的值，
 * 實測抓到約 175）量級差距很大。線性補間 `lerp(1, 175, k)` 在動畫前半段
 * （`k` 還小）算出來的值幾乎貼著 1，畫面因此在放大倍率極低的狀態停留了
 * 一大段時間，物件小到跟沒畫面沒兩樣；直到 `k` 逼近 1 才突然衝到最終值，
 * 觀感是「畫面空白一陣子、最後才突然彈出」，不是平滑放大。
 * 換成幾何插值 `from * (to/from)^k`（鏡頭「焦距加倍＝視野減半」本來就是
 * 乘性關係，不是加減關係），同樣 0.6 秒內每一刻的相對變化率一致，視覺上
 * 才是真正平滑的縮放，不會有前段停滯、後段暴衝的感覺。
 * `from`/`to` 任一為非正數（理論上不會發生——`orthoZoomForFrame` 保證
 * 回傳正數，掛載時的初始 `zoom` 也固定是 1）時退回線性插值，純粹是防禦性
 * fallback，不影響正常路徑。
 */
function lerpZoom(from: number, to: number, k: number): number {
  if (from <= 0 || to <= 0) return THREE.MathUtils.lerp(from, to, k)
  return from * Math.pow(to / from, k)
}

/**
 * 相機預設切換時以 0.6 秒平滑移動，而不是瞬移。
 *
 * 正交模式下 `camera` 會是 `THREE.OrthographicCamera`：它沒有 `fov`，
 * 「畫面裡東西看起來多大」改由 `zoom` 決定，補間邏輯跟透視模式的 `fov`
 * 完全對稱——`zoom` 也是跟位置/注視點一起補間，不能在第一幀就跳完，
 * 理由跟原本 `fov` 的補間一樣：否則位置花 0.6 秒平滑移動，畫面卻在第一幀
 * 突然放大/縮小，看起來會有一下突兀的跳動。
 *
 * `ProjectionCamera` 會在同一個 Canvas 內交換相機物件；`camera` 因此會在
 * 投影切換時變更身分，這個 effect 會以新相機的姿態重新起算同一段補間。
 */
export function CameraRig() {
  const { camera, scene, controls, size } = useThree()
  const preset = useSceneStore((s) => s.cameraPreset)
  const objectCount = useSceneStore((s) => s.objects.length)
  const projection = useSceneStore((s) => s.projection)

  /**
   * `size`（視埠像素尺寸）故意**不**放進下面 `useEffect` 的相依陣列——
   * 如果放了，使用者拖動瀏覽器視窗改變寬高時就會重新觸發整段補間，把
   * 相機從使用者手動轉到/縮放到的位置「拉回」目前預設對應的框景位置，
   * 使用者操作到一半的鏡頭會被無預警重置。這裡改用 ref 鏡射目前值，只在
   * 效果因為別的理由（切預設、切投影模式、場景物件數變化）重新執行時，
   * 讀到當下最新的視埠高度去算正交 zoom，不會單獨因為 resize 觸發整段
   * 補間——跟 `Dimensions.tsx` 的 `placementRef`、`useDragOnGround.ts` 的
   * `finishDragRef` 是同一種「讓 effect 讀到最新值但不因它重新觸發」手法。
   */
  const sizeRef = useRef(size)
  sizeRef.current = size

  const tween = useRef<{
    from: THREE.Vector3
    to: THREE.Vector3
    fromTarget: THREE.Vector3
    toTarget: THREE.Vector3
    fromFov: number
    toFov: number
    fromZoom: number
    toZoom: number
    startedAt: number
  } | null>(null)

  /**
   * Esc 代表使用者要中斷目前的操作。相機補間不是 React state，單靠清掉
   * 物件選取不會停止 `useFrame` 仍持有的 tween；收到鍵盤層發出的取消事件
   * 時把 ref 清空，下一幀就不再套用任何待完成的補間值，並保留中斷當下的
   * 相機位置／zoom。
   */
  useEffect(() => {
    const cancel = () => {
      tween.current = null
    }
    window.addEventListener(CAMERA_TRANSITION_CANCEL_EVENT, cancel)
    return () => window.removeEventListener(CAMERA_TRANSITION_CANCEL_EVENT, cancel)
  }, [])

  useEffect(() => {
    // 只框「展場物件」（`Viewport` 裡 name="scene-objects" 的那個 group），
    // 不能對整個 `scene` 算包圍盒——`GroundGrid` 的陰影承接面是 80x80
    // 公尺的實心平面，混進去會把場景半徑灌到 40 公尺，見 Viewport.tsx
    // 對應的註解與瀏覽器實測紀錄。
    const sceneObjects = scene.getObjectByName('scene-objects')
    const box = new THREE.Box3()
    if (sceneObjects) box.setFromObject(sceneObjects)
    const boxSize = new THREE.Vector3()
    if (!box.isEmpty()) box.getSize(boxSize)
    const radius = Math.max(boxSize.x, boxSize.y, boxSize.z) / 2

    const framed = framePreset(preset, radius, projection)
    const orbit = controls as unknown as { target: THREE.Vector3 } | undefined

    // fov／zoom 也要跟位置/注視點一起補間，不能在這裡直接設定——否則位置花
    // 0.6 秒平滑移動、視野角度或縮放倍率卻在第一幀就跳完，看起來會有一下
    // 突兀的縮放感（例如主視角 fov 45 切到人眼視角 fov 39.6）。
    const fromFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : framed.fov
    const fromZoom = camera instanceof THREE.OrthographicCamera ? camera.zoom : 1
    const toZoom =
      camera instanceof THREE.OrthographicCamera
        ? orthoZoomForFrame(preset, radius, sizeRef.current.height, projection)
        : 1

    tween.current = {
      from: camera.position.clone(),
      to: new THREE.Vector3(...framed.position),
      fromTarget: orbit?.target.clone() ?? new THREE.Vector3(),
      toTarget: new THREE.Vector3(...framed.target),
      fromFov,
      toFov: framed.fov,
      fromZoom,
      toZoom,
      startedAt: performance.now(),
    }
    // objectCount 進相依陣列，讓加入第一個物件時自動框住場景。`size` 刻意
    // 不在這裡——理由見上方 `sizeRef` 的說明。
  }, [preset, objectCount, camera, scene, controls, projection])

  useFrame(() => {
    const t = tween.current
    if (!t) return
    const elapsed = performance.now() - t.startedAt
    const raw = Math.min(1, elapsed / TRANSITION_MS)
    // easeInOutCubic
    const k = raw < 0.5 ? 4 * raw ** 3 : 1 - (-2 * raw + 2) ** 3 / 2

    camera.position.lerpVectors(t.from, t.to, k)
    const orbit = controls as unknown as { target: THREE.Vector3; update: () => void } | undefined
    if (orbit) {
      orbit.target.lerpVectors(t.fromTarget, t.toTarget, k)
      orbit.update()
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = THREE.MathUtils.lerp(t.fromFov, t.toFov, k)
      camera.updateProjectionMatrix()
    } else if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = lerpZoom(t.fromZoom, t.toZoom, k)
      camera.updateProjectionMatrix()
    }
    if (raw >= 1) tween.current = null
  })

  return null
}
