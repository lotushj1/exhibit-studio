import { useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
// 引入 @react-three/fiber 以觸發其對 JSX.IntrinsicElements 的型別擴充
// （meshPhysicalMaterial 等 R3F 內建標籤），本檔目前未使用其具名匯出。
import type {} from '@react-three/fiber'
import { resolveFinish } from './finishes'
import { computeTextureFit } from './textureFit'
import { useTextureStore } from './textureStore'
import { useHighQualityGlass } from './useHighQualityGlass'
import type { SurfaceSpec } from '../objects/types'

type Props = {
  spec: SurfaceSpec
  /** 這一面的實際寬度（公分），用來讓貼圖不變形。 */
  widthCm: number
  /** 這一面的實際高度（公分）。 */
  heightCm: number
  /**
   * R3F 的掛載點。單一材質的 mesh 不必指定；
   * BoxGeometry 六面各自上材質時傳 `material-0` 到 `material-5`。
   */
  attach?: string
}

/**
 * 依 SurfaceSpec 產生材質。貼圖的 repeat 與 offset 依這一面的
 * 實際長寬比計算，因此同一張圖貼到不同比例的面上都不會被拉變形。
 */
export function SurfaceMaterial({ spec, widthCm, heightCm, attach }: Props) {
  const highQuality = useHighQualityGlass((s) => s.enabled)
  const assets = useTextureStore((s) => s.assets)
  const getTexture = useTextureStore((s) => s.getTexture)

  const props = resolveFinish(spec.finish, highQuality)

  // 只取出這一面實際用得到的 asset／texture，不要讓依賴陣列納入整個
  // assets map：assets 在任何一張圖上傳或刪除時都會整包被重建，若把它整個
  // 放進 useMemo 依賴，會讓場景中每一個已貼圖的面都跟著重跑 memo。
  const t = spec.texture
  const asset = t ? assets[t.assetId] : undefined
  const source = t ? getTexture(t.assetId) : undefined

  const [map, setMap] = useState<THREE.Texture | null>(null)
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null)

  /**
   * 這個 clone 的建立與釋放都放在同一個 `useLayoutEffect` 裡（而不是「useMemo 建立、
   * 另一個 effect 只負責 dispose」），是刻意的：React 18 的 `StrictMode`
   * 在開發模式下會對每個 effect 做「mount → cleanup → mount」的模擬雙重呼叫，
   * 藉此找出沒有正確清理的副作用。
   *
   * 如果建立（`source.clone()`）放在 `useMemo`、只有 dispose 放在 `useEffect`：
   * 第一次 mount 的 effect 只掛一個 cleanup、不做事；StrictMode 模擬的
   * 「立即 unmount」會呼叫這個 cleanup，把 `useMemo` 產生的那個 texture
   * dispose 掉；接著「重新 mount」時，因為 `useMemo` 的依賴沒變，不會重新
   * 執行，`map` 還是同一個、已經被 dispose 的 texture 參考——材質最終綁定
   * 的就是一個已經釋放 GPU 資源的 texture，畫面顯示空白／材質原色，
   * 貼圖完全不會出現（這正是瀏覽器實測抓到的實際 bug，不是理論疑慮）。
   *
   * 把建立也搬進 effect：模擬的「立即 unmount」一樣會 dispose，但接下來
   * 的「重新 mount」會重新執行整個 effect、重新 `clone()` 一份全新的
   * texture，兩邊生命週期對得起來，不會有「已釋放卻仍被引用」的空窗期。
   *
   * 用 `useLayoutEffect` 而非 `useEffect`：後者在瀏覽器完成這一幀繪製之後才會
   * 執行，掛載當下、以及往後每次相依變更時都會先讓瀏覽器畫出「舊 map／null」
   * 那一幀，再補畫新的一幀——使用者會看到一閃而過的無貼圖畫面（或換圖時舊圖
   * 閃一下）。`useLayoutEffect` 在瀏覽器繪製前、DOM／R3F 場景圖已提交後同步
   * 執行，新的 map 在使用者看到任何畫面之前就已經套上，StrictMode 的
   * mount-cleanup-mount 安全性不變（cleanup 一樣會跑、一樣會 dispose）。
   */
  useLayoutEffect(() => {
    if (!t || !asset || !source) {
      setMap(null)
      return
    }

    const tex = source.clone()
    tex.needsUpdate = true

    const fit = computeTextureFit({
      surfaceWidthCm: widthCm,
      surfaceHeightCm: heightCm,
      imageWidthPx: asset.widthPx,
      imageHeightPx: asset.heightPx,
      fit: t.fit,
      scale: t.scale,
      offset: t.offset,
      rotation: t.rotation,
    })

    tex.repeat.set(fit.repeat[0], fit.repeat[1])
    tex.offset.set(fit.offset[0], fit.offset[1])
    tex.center.set(fit.center[0], fit.center[1])
    tex.rotation = fit.rotation
    // contain 模式的取樣範圍超出圖片，必須夾邊否則會出現重複的鏡像
    const clamp = t.fit === 'contain'
    tex.wrapS = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
    tex.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
    setMap(tex)

    // 換下一組依賴（貼圖換掉、fit/位移/平鋪調整、面尺寸改變）或元件卸載時，
    // 釋放這一份 clone 的 GPU 資源，避免每次調整都留下一個永遠不會被回收的
    // WebGLTexture。
    return () => {
      tex.dispose()
    }
    // getTexture 是 zustand store 建立時就固定的函式參考，不會隨渲染改變，
    // 不需要放進依賴陣列。
  }, [t, asset, source, widthCm, heightCm])

  /**
   * `map` 從 null／undefined 變成第一張真正的 Texture（或反過來，圖被移除）時，
   * 材質必須被標記 `needsUpdate = true`，否則貼圖會完全不顯示。
   *
   * 根因（瀏覽器實測抓到的真實 bug，不是理論疑慮）：這個材質在還沒有貼圖時
   * 就已經掛載並完成第一次 WebGL 編譯（`map` 是 `undefined`，編譯出來的
   * shader 沒有 `#define USE_MAP`、沒有取樣貼圖的程式碼）。之後
   * `useLayoutEffect` 建立好 texture、呼叫 `setMap(tex)`，React Three Fiber
   * 的 `applyProps` 只是單純把新值指定給 `material.map`（`currentInstance[key]
   * = value`），並不會去動 `material.needsUpdate`。而 three.js 的
   * `WebGLRenderer.setProgram` 判斷要不要重新編譯 shader，依據的是
   * `material.version === materialProperties.__version`——`version` 只有在
   * `needsUpdate` 被設成 `true` 時才會遞增。沒有這一步，`material.map` 在
   * JS 端是正確的物件（可以在 devtools 讀到正確尺寸的圖），但因為 shader
   * 從來沒有重新編譯過，畫面上永遠是材質原色，貼圖形同虛設。
   *
   * 只在「有沒有貼圖」這個布林值真的改變時才觸發（依賴陣列用 `!!map`，不是
   * `map` 本身）：同一面貼圖之後調整 fit／位移／平鋪／旋轉時，
   * `useLayoutEffect` 會 `clone()` 出全新的 Texture 物件，但貼圖「存在」這件
   * 事沒有改變，shader 的 `#define USE_MAP` 不需要重新編譯，只是換一張圖到
   * 同一個 sampler2D uniform（three.js 每幀都會自動重新綁定 texture uniform，
   * 不需要 `needsUpdate`）——用 `!!map` 當依賴可以避免每次調整滑桿都白白
   * 觸發一次不必要的 shader 重新編譯。
   */
  useLayoutEffect(() => {
    if (materialRef.current) materialRef.current.needsUpdate = true
  }, [!!map])

  /**
   * 原色顯示：改用 `meshBasicMaterial`，它完全不參與光照計算，配上白色
   * `color`（不染色）與 `toneMapped={false}`（跳過 ACES tone mapping），
   * 螢幕上的像素就等於圖檔本身的顏色。
   *
   * 只有真的有貼圖時才走這條路。沒有貼圖卻開著這個旗標的話，basic 材質會
   * 畫出一片死板的純色，比原本的受光版本還糟，所以用 `map &&` 擋住。
   *
   * 這裡不掛 `materialRef`：上面那個 `needsUpdate` 的修補是為了「材質先以
   * 無貼圖狀態編譯過、之後才拿到貼圖」這個順序而存在的，而這條路徑只在
   * `map` 已經存在時才會渲染，材質一建立就帶著貼圖編譯，不會有那個問題。
   * 切換原色顯示會讓 R3F 換掉整個材質元素（basic 與 physical 是不同標籤），
   * 新材質本來就會重新編譯。
   */
  if (t?.unlit && map) {
    return <meshBasicMaterial attach={attach} map={map} toneMapped={false} />
  }

  return (
    <meshPhysicalMaterial
      ref={materialRef}
      attach={attach}
      color={spec.color}
      map={map ?? undefined}
      roughness={props.roughness}
      metalness={props.metalness}
      clearcoat={props.clearcoat ?? 0}
      clearcoatRoughness={props.clearcoatRoughness ?? 0}
      transparent={props.transparent ?? false}
      opacity={props.opacity ?? 1}
      transmission={props.transmission ?? 0}
      ior={props.ior ?? 1.5}
      thickness={props.thickness ?? 0}
      envMapIntensity={props.envMapIntensity ?? 1}
    />
  )
}
