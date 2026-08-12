import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { PMREMGenerator } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * 一盞投影主光加一盞補光。
 * 環境反射用 Three.js 內建的 RoomEnvironment，程序生成、零外部檔案下載。
 * 沒有環境貼圖時金屬材質會像塑膠。
 *
 * 主光位置 Z 軸是 -5 而不是 brief 原本給的 +5：瀏覽器實測發現，
 * Viewport 預設相機在 [3.2, 2.4, 3.8]，跟 brief 原本的光源方位角
 * （atan2(5,4)≈51°）幾乎一樣（相機方位角 atan2(3.8,3.2)≈50°），
 * 導致地面陰影整個投到物件背對相機的那一側，從預設視角完全看不到
 * （用 boxPlinth 測試：即使把 shadowMaterial opacity 從 0.28 調到 0.9
 * 都看不出陰影，直到把光源方位角轉開才看得到，證實是角度問題不是
 * 材質/亮度問題）。只翻轉 Z 的正負號，讓陰影甩到相機看得到的一側，
 * 高度與整體光照角度不變。
 */
export function Lighting() {
  const { gl, scene } = useThree()

  useEffect(() => {
    const pmrem = new PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04)
    // Three.js 慣例：fromScene() 一回來就 dispose 產生器本身，環境貼圖
    // （env.texture）已經產出來了，不需要 pmrem 繼續存在。
    pmrem.dispose()
    scene.environment = env.texture
    return () => {
      env.texture.dispose()
      scene.environment = null
    }
  }, [gl, scene])

  return (
    <>
      <hemisphereLight args={['#ffffff', '#5a5f66', 0.55]} />
      <directionalLight
        position={[4, 7, -5]}
        intensity={2.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={0.1}
        shadow-camera-far={30}
        shadow-bias={-0.0006}
      />
    </>
  )
}
