import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { Lighting } from './Lighting'
import { GroundGrid } from './GroundGrid'
import { ObjectNode } from './ObjectNode'
import { CameraRig } from './CameraRig'
import { Dimensions } from './Dimensions'
import { ScreenshotBridge } from './useScreenshot'
import { SCENE_COLORS } from './sceneColors'
import { useEffect, useRef } from 'react'
import { useSceneStore, type ProjectionMode } from '../store/sceneStore'
import { useAppearanceStore } from '../store/appearanceStore'
import { projectionSwitchLabel, projectionSwitchRemainingMs } from '../ui/projectionSwitch'

type ProjectionTransitionSchedule = {
  mode: ProjectionMode
  cancel: () => void
}

export function Viewport() {
  const objects = useSceneStore((s) => s.objects)
  const selectObject = useSceneStore((s) => s.selectObject)
  const projection = useSceneStore((s) => s.projection)
  const projectionTransitioning = useSceneStore((s) => s.projectionTransitioning)
  const finishProjectionTransition = useSceneStore((s) => s.finishProjectionTransition)
  const appearance = useAppearanceStore((s) => s.appearance)
  const colors = SCENE_COLORS[appearance]
  const transitionSchedule = useRef<ProjectionTransitionSchedule | null>(null)

  useEffect(() => {
    return () => {
      const schedule = transitionSchedule.current
      if (schedule?.mode !== projection) return
      schedule.cancel()
      transitionSchedule.current = null
    }
  }, [projection])

  const transitionLabel = projectionSwitchLabel(projectionTransitioning)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        /**
         * R3F 只在「目前沒有相機（第一次掛載）」時依 `orthographic`／`camera`
         * 這兩個 prop 建立預設相機，往後 render 即使這兩個 prop 變了也不會
         * 重建（見 `@react-three/fiber` 的 `configure()`：判斷式只在
         * `state.camera` 不存在時成立，之後永遠是既有相機，避免蓋掉使用者
         * 自己接管的相機狀態）。要在正交／透視之間切換相機**種類**，唯一可靠
         * 的方式是用 `key` 強制整個 Canvas（含相機、`OrbitControls`、
         * `CameraRig`）卸載重新掛載，而不是期待 `orthographic` prop 本身能
         * 動態切換底層相機物件。`makeDefault` 的 `OrbitControls` 會在重新
         * 掛載時重新把自己註冊成預設控制器，`CameraRig` 的 `useEffect` 也會
         * 在掛載時用新相機的初始狀態重新起算一次過渡動畫，兩者都能正確跟上
         * 新相機，不需要額外同步邏輯。
         *
         * 代價（Review Finding 2，2026-08-01 補做時複查）：`key` 改變會讓
         * R3F 真的呼叫 `gl.forceContextLoss()` 銷毀舊的 WebGL context、建立
         * 一顆全新的。這不是換個相機物件那麼便宜——新 context 要重新編譯
         * 場景裡每一種材質的 shader，且每一個貼了圖的面都要把
         * `THREE.Texture` 重新上傳一次到 GPU，舊 context 的編譯結果與貼圖
         * 快取全部作廢。這是切換投影時會看到短暫重繪的根本原因；理論上貼圖
         * 數量、物件數越多這段成本會越高，但實測（見下方連結的報告）在
         * 受節流的自動化瀏覽器環境下，有貼圖與沒貼圖的場景測出來的重繪
         * 時間沒有可信差異——這是推論尚未被觀測證實，不是已經驗證過的事實，
         * 之後想動這塊的人如果要優化，建議先在真實使用情境下重新量測。
         * 這一輪沒有進一步優化（例如手動保留/
         * 搬移 WebGL context、或改用單一 context 搭配手動切換相機投影矩陣
         * 的做法），只留這則註解給之後想動這塊的人一個切入點。實測方法見
         * `README.md`「投影模式」一節與
         * `.superpowers/sdd/2026-07-31-exhibit-studio/toggles-report.md`。
         */
        key={projection}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={[1, 2]}
        orthographic={projection === 'orthographic'}
        camera={
          projection === 'orthographic'
            ? { position: [3.2, 2.4, 3.8], zoom: 1, near: 0.05, far: 200 }
            : { position: [3.2, 2.4, 3.8], fov: 45, near: 0.05, far: 200 }
        }
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1
          gl.outputColorSpace = THREE.SRGBColorSpace

          const capturedProjection = projection
          if (!projectionTransitioning) return

          transitionSchedule.current?.cancel()
          const transitionStartedAt = performance.now()
          let firstFrame: number | null = null
          let secondFrame: number | null = null
          let completionTimeout: number | null = null
          let cancelled = false
          const cancel = () => {
            cancelled = true
            if (firstFrame !== null) window.cancelAnimationFrame(firstFrame)
            if (secondFrame !== null) window.cancelAnimationFrame(secondFrame)
            if (completionTimeout !== null) window.clearTimeout(completionTimeout)
          }
          const schedule: ProjectionTransitionSchedule = { mode: capturedProjection, cancel }
          transitionSchedule.current = schedule

          const finish = () => {
            if (cancelled) return
            finishProjectionTransition(capturedProjection)
            if (transitionSchedule.current === schedule) transitionSchedule.current = null
          }
          const finishAfterPaint = () => {
            if (cancelled) return
            const remainingMs = projectionSwitchRemainingMs(transitionStartedAt, performance.now())
            if (remainingMs > 0) {
              completionTimeout = window.setTimeout(finish, remainingMs)
              return
            }
            finish()
          }

          if (typeof window.requestAnimationFrame !== 'function') {
            completionTimeout = window.setTimeout(finishAfterPaint, projectionSwitchRemainingMs(transitionStartedAt, performance.now()))
            return
          }

          firstFrame = window.requestAnimationFrame(() => {
            if (cancelled) return
            secondFrame = window.requestAnimationFrame(() => {
              finishAfterPaint()
            })
          })
        }}
        onPointerMissed={() => selectObject(null)}
        style={{ background: colors.background }}
      >
        <Lighting />
        <GroundGrid />
        {/*
          `CameraRig` 靠這個 group 的名字（`scene-objects`）從 `useThree().scene`
          撈出「只框展場物件」的子樹來算包圍盒。不能直接對整個 `scene` 算
          Box3——`GroundGrid` 的陰影承接面是 80x80 公尺的實心平面，混進整體
          場景的 Box3.setFromObject 會把場景半徑灌到 40 公尺，讓每個相機
          預設都退到遠得誇張的距離，物件在畫面上縮成一個小點（瀏覽器實測
          時發現：加入方箱展台後，主視角瞬間拉遠到幾乎看不到物件，關掉
          GroundGrid 後距離就正常了，證實是地面平面把包圍盒撐大，不是相機
          預設的公式錯）。地面／光源不是「展場物件」，不該算進場景大小。
        */}
        <group name="scene-objects">
          {objects.map((o) => (
            <ObjectNode key={o.id} object={o} />
          ))}
        </group>
        <Dimensions />
        {/*
          `preserveDrawingBuffer: true` 常開（而不是設計文件原本設想的「按下
          截圖那一刻才臨時開」）：這個旗標只能在建立 WebGL context 時決定，
          建立後無法中途切換，所以要嘛從一開始就開，要嘛永遠不能截圖。它的
          成本主要在記憶體（drawing buffer 不能在每次 swap 後被清掉/丟棄），
          不是每幀的運算量，瀏覽器實測互動（拖曳、轉鏡頭）沒有量到明顯掉幀。
          真正昂貴的「用兩倍 pixelRatio 重新渲染整個場景」只發生在按下截圖
          按鈕那一刻，見 `useScreenshot.ts`。
        */}
        <ScreenshotBridge />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          // 剛好 π/2 是水平視線，還沒到地面下——奇異點在極角 0 與 π，不在 π/2，
          // 所以精確等於 π/2 沒有數值問題。這裡不能留原本的「- 0.02」邊際：
          // OrbitControls.update() 每一幀都無條件夾制 spherical.phi（不只在使用者
          // 操作時才夾），人眼視角預設把 position.y 跟 target.y 都設成 1.6，
          // offset.y 剛好 0，phi 剛好 π/2，「- 0.02」的邊際會把相機往上推到
          // 1.6 + distance * sin(0.02)，場景越大偏差越大，導致人眼視角量出來的
          // 高度不是精確的 1.6 公尺（瀏覽器實測時用 camera.position.y 讀出來抓到）。
          maxPolarAngle={Math.PI / 2}
          minDistance={0.5}
          maxDistance={40}
          target={[0, 0.6, 0]}
          /* 中鍵改成旋轉視角（預設是 DOLLY）。左鍵在物件上是拖曳物件、在空白
           * 處才是轉視角，場景一擠就找不到空白處可以按，所以給一個不管游標在
           * 哪裡都能轉的鍵。滾輪本來就能縮放，中鍵的 DOLLY 是重複功能，換掉
           * 沒有損失。`useDragOnGround` 只接主鍵，中鍵按在物件上不會被攔截。 */
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.ROTATE,
            RIGHT: THREE.MOUSE.PAN,
          }}
        />
        <CameraRig />
      </Canvas>
      {transitionLabel && (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: colors.labelBg,
            color: colors.labelText,
            fontSize: 16,
            fontWeight: 500,
            pointerEvents: 'none',
          }}
        >
          {transitionLabel}
        </div>
      )}
    </div>
  )
}
