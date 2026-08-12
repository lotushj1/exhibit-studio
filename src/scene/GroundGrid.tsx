import { Grid } from '@react-three/drei'
import { SCENE_COLORS } from './sceneColors'
import { useAppearanceStore } from '../store/appearanceStore'

/**
 * 無限網格地面加陰影承接面。格線每 10 公分一格，粗線每公尺一條。
 *
 * `<Grid infiniteGrid>` 的 drei 實作會把自己的 `args` 平面頂點乘上
 * `1 + fadeDistance` 來做出「無限延伸」的錯覺（見
 * node_modules/@react-three/drei/core/Grid.js 的 vertex shader）。
 * 若這裡的 `args` 跟下方陰影承接面一樣給 80，頂點的座標會被放大到
 * 80/2 * 41 ≈ 1640 個單位，遠超過 Viewport 相機的 far=200——這些頂點
 * 落在 GPU clip space 之外，光柵化時直接被裁掉，整片格線畫面上完全
 * 看不到（瀏覽器實測時發現：改 cellColor/sectionColor 成亮紅/亮綠也
 * 還是一片全黑，關掉 infiniteGrid 才看得到格線，證實是幾何超出遠裁切
 * 面，不是顏色對比問題）。
 * 這跟 Three.js 場景圖的 `frustumCulled`（依物件 bounding box 整體跳過
 * 繪製的 CPU 端剔除機制）是兩回事——drei 的 Grid 本來就對這個 mesh設
 * `frustumCulled={false}`（停用場景圖剔除，因為 shader 會在 GPU 端改變
 * 頂點位置，CPU 端算出來的 bounding box 不準），所以看不到格線時去找
 * `frustumCulled` 開關會找錯方向；真正的原因是每個頂點各自在 clip
 * space 被裁切，不是整個 mesh 被跳過繪製。
 * `args` 只是這個縮放技巧的「種子」尺寸，跟格線實際涵蓋範圍無關。
 *
 * `args` 該給多大，要從相機能跑多遠反推，不能只挑「塞得進 far=200」的
 * 隨便小值。決定格線淡出範圍的三個數字：
 *   - `OrbitControls.maxDistance`（Viewport.tsx，目前 40）：相機能拉到
 *     離原點多遠。
 *   - `Grid.fadeDistance`（目前 40）：drei 依相機在地面平面上的投影位置
 *     算淡出，不是依這個 mesh 的原點。
 *   - drei shader 的 `1 + fadeDistance` 縮放（見上方）：這個 mesh 的頂點
 *     半寬（`args[0] / 2`）會被放大這麼多倍，才是它真正的幾何半徑。
 * 相機拉到最遠（`maxDistance`）時，還應該看得到格線的範圍半徑是
 * `maxDistance + fadeDistance`；換算回縮放前的半寬，公式是
 * `(maxDistance + fadeDistance) / (1 + fadeDistance)`。代入目前的
 * 40 / 40 → (40 + 40) / (1 + 40) ≈ 1.95。`args={[2, 2]}`（半寬 1）
 * 剛好卡在這個邊界、幾乎零餘裕，相機拉到底時格線的可視範圍會超出
 * mesh 的幾何邊界、變成硬邊而不是柔和淡出。改成 `args={[4, 4]}`
 * （半寬 2，縮放後半徑 2 × 41 = 82 ＞ 80）留出安全餘裕。
 * 之後如果調整 `maxDistance` 或升級 drei（shader 縮放邏輯可能改變），
 * 要重新檢查這個推導式是否還成立。
 */
export function GroundGrid() {
  // 深色底下用亮灰格線，淺色底下要反過來用暗灰格線才看得清楚——顏色表見
  // `sceneColors.ts`，跟選取外框／尺寸標註共用同一份，避免各自維護。
  const appearance = useAppearanceStore((s) => s.appearance)
  const colors = SCENE_COLORS[appearance]

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <shadowMaterial opacity={0.28} />
      </mesh>
      <Grid
        args={[4, 4]}
        cellSize={0.1}
        cellThickness={0.5}
        cellColor={colors.gridCell}
        sectionSize={1}
        sectionThickness={1}
        sectionColor={colors.gridSection}
        fadeDistance={40}
        fadeStrength={1.5}
        infiniteGrid
        followCamera={false}
      />
    </>
  )
}
