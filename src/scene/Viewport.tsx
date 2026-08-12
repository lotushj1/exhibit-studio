import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { Lighting } from './Lighting'
import { GroundGrid } from './GroundGrid'
import { ObjectNode } from './ObjectNode'
import { CameraRig } from './CameraRig'
import { ProjectionCamera } from './ProjectionCamera'
import { Dimensions } from './Dimensions'
import { ScreenshotBridge } from './useScreenshot'
import { SCENE_COLORS } from './sceneColors'
import { useSceneStore } from '../store/sceneStore'
import { useAppearanceStore } from '../store/appearanceStore'

export function Viewport() {
  const objects = useSceneStore((s) => s.objects)
  const selectObject = useSceneStore((s) => s.selectObject)
  const projection = useSceneStore((s) => s.projection)
  const appearance = useAppearanceStore((s) => s.appearance)
  const colors = SCENE_COLORS[appearance]

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={[1, 2]}
        camera={{ position: [3.2, 2.4, 3.8], fov: 45, near: 0.05, far: 200 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1
          gl.outputColorSpace = THREE.SRGBColorSpace
        }}
        onPointerMissed={() => selectObject(null)}
        style={{ background: colors.background }}
      >
        <ProjectionCamera projection={projection} />
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
    </div>
  )
}
