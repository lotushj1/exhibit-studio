import { useRef } from 'react'
import { Html, Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useSceneStore } from '../store/sceneStore'
import { useAppearanceStore } from '../store/appearanceStore'
import { buildDimensions } from './dimensionMath'
import { measureLocalBounds } from './measureLocalBounds'
import { useDimensionPlacementStore, type DimensionPlacement } from './dimensionsBridge'
import { DimensionDirtyTracker } from './dimensionDirtyTracker'
import { SCENE_COLORS } from './sceneColors'

/**
 * 標註線與標籤都是用各自物件的**本地座標**算出來的（`measureLocalBounds`
 * 回傳的尺寸/中心不含物件自己的 position/rotation），所以每個物件的一組
 * 線要包在一個帶著該物件目前 position 與 Y 軸角度的 `<group>` 裡再渲染，
 * 才會跟著物件一起搬移、一起旋轉、貼在轉過的箱體上，而不是永遠停在世界
 * 座標的正面。
 *
 * `Placement` 的定義與目前值放在 `dimensionsBridge.ts` 這個獨立的 zustand
 * store 裡（而不是這裡的 `useState`），讓截圖功能能在擷取畫面那一刻用
 * `getState()` 讀到「現在螢幕上的標註長什麼樣子」，藉此把公分數字合成回
 * 截圖（見 `useScreenshot.ts`）。「全部物件」模式加入後，這裡改成用物件
 * id 當 key 的 map（`placements`），每個物件各自一份 `Placement`。
 */
type Placement = DimensionPlacement

/** 兩組標註結果在數值上是否相同（線條逐一比較，加上外層 group 的 position/rotationY）。 */
function samePlacement(a: Placement, b: Placement): boolean {
  if (a.rotationY !== b.rotationY) return false
  for (let i = 0; i < 3; i++) {
    if (a.position[i] !== b.position[i]) return false
  }
  if (a.lines.length !== b.lines.length) return false
  for (let i = 0; i < a.lines.length; i++) {
    const la = a.lines[i]
    const lb = b.lines[i]
    if (la.axis !== lb.axis || la.labelCm !== lb.labelCm) return false
    for (let k = 0; k < 3; k++) {
      if (la.from[k] !== lb.from[k] || la.to[k] !== lb.to[k] || la.labelPos[k] !== lb.labelPos[k]) return false
    }
  }
  return true
}

export function Dimensions() {
  const dimensionMode = useSceneStore((s) => s.dimensionMode)
  const selectedId = useSceneStore((s) => s.selectedId)
  const appearance = useAppearanceStore((s) => s.appearance)
  const colors = SCENE_COLORS[appearance]
  const { scene } = useThree()
  const placements = useDimensionPlacementStore((s) => s.placements)
  const setPlacement = useDimensionPlacementStore((s) => s.setPlacement)
  const removePlacement = useDimensionPlacementStore((s) => s.removePlacement)
  const clearPlacements = useDimensionPlacementStore((s) => s.clearPlacements)
  const placementsRef = useRef(placements)
  placementsRef.current = placements
  /**
   * 每個物件各自的「上一幀觸發量測時的 params/transform 序列化 key」
   * （見 `dimensionDirtyTracker.ts`）。跟被追蹤物件無關的變動（別的物件被
   * 拖曳、store 整包深拷貝出新參考）不會改變某個特定 id 的 key，該物件的
   * 量測就會被跳過——多物件模式下，拖曳其中一個不會讓其他物件跟著重算
   * 包圍盒。
   */
  const dirtyRef = useRef(new DimensionDirtyTracker())

  /**
   * 用 `useFrame`（每個動畫幀跑一次）而不是 `useEffect` + 相依陣列讀取
   * Three.js 場景圖狀態。
   *
   * 背景：實作初版用 `useEffect`，實測「把寬度數字輸入框從 120 改成
   * 200」時標註數字沒有跟著變，用 console.log 印出來發現當下量到的尺寸
   * 仍是舊的 120cm。這個現象是真的（重現了兩次），但後續 review 指出我
   * 原本寫的成因推論不準確：React 在同一次更新裡，理論上會把所有 fiber
   * 的 mutation（含 R3F 自訂 reconciler 套用新的 `boxGeometry` args）都
   * commit 完，才會執行任何元件的 `useEffect`——不應該有「另一個元件的
   * commit 還沒完成」這種跨元件搶跑問題。實際成因更可能是量測當下漏了
   * 正確的 `updateWorldMatrix` 時機、或是瀏覽器自動化測試工具用合成事件
   * 模擬輸入時造成的假象，而不是 React 本身的提交順序不保證。這裡不再
   * 沿用那個不準確的推論。
   *
   * 不論確切成因是什麼，`useFrame` 本身仍是這裡正確的選擇：它保證在
   * R3F 每一幀的場景圖完全提交完之後才執行，量測時機不會有任何時間點
   * 上的疑慮，也天生就能正確處理拖曳中每一幀的即時更新（`setTransform`
   * 的 `live` 路徑），不用另外判斷「這是不是拖曳中的即時更新」。
   *
   * 效能：`measureLocalBounds` 要遍歷節點底下所有網格算包圍盒，比單純的
   * 數值比較貴得多，不該每幀都做——即使場景完全靜止。所以在呼叫它之前，
   * 先用 `useSceneStore.getState()`（不訂閱，純讀值，不會造成這個元件
   * 重新渲染）直接讀每個目標物件目前的 `params`/`transform`，序列化成一把
   * key 跟這個物件上一次觸發量測時的 key 比較（`DimensionDirtyTracker`，
   * 每個物件各自一把 key，不是對整個場景做一次大字串比對），沒變就直接
   * 跳過這個物件，完全不碰 `Box3`。只有這個物件自己的尺寸或姿態真的變了
   * （或剛被納入標註範圍），才會真的重新量測。量出來的結果最後還會再跟
   * `placementsRef` 做一次逐值比較（`samePlacement`）才決定要不要
   * `setPlacement`，兩層過濾疊加：靜止時完全不遍歷、真的要量測時也不會
   * 產生多餘的重新渲染。
   */
  useFrame(() => {
    const mode = useSceneStore.getState().dimensionMode
    if (mode === 'off') {
      if (dirtyRef.current.trackedIds().length > 0) {
        dirtyRef.current.clear()
        clearPlacements()
      }
      return
    }

    const objects = useSceneStore.getState().objects
    const currentSelectedId = useSceneStore.getState().selectedId
    const targets =
      mode === 'selected' ? objects.filter((o) => o.id === currentSelectedId) : objects.filter((o) => o.visible !== false)
    const targetIdSet = new Set(targets.map((o) => o.id))

    // 移除不再涵蓋的 id 的追蹤紀錄與標註——取消選取、切換模式、物件被隱藏
    // 或刪除都會走到這裡，不論原因是什麼，統一收斂成「不在目標集合裡就
    // 清掉」，不留孤兒標註懸在畫面上。
    for (const id of dirtyRef.current.trackedIds()) {
      if (!targetIdSet.has(id)) {
        dirtyRef.current.forget(id)
        removePlacement(id)
      }
    }

    for (const target of targets) {
      /**
       * 節點存在性檢查必須放在下面的 key 短路（便宜前置檢查）之前、對每個
       * 目標物件無條件執行——這是修回歸的關鍵。`scene.getObjectByName`
       * 只是一次查表，非常便宜，不會抵銷上面加的效能優化。
       *
       * 踩過的坑：這個檢查如果放在 key 短路之後，只有「量測到新 bounds
       * 之後」才會發現節點不見了。但把物件（隱藏，不是刪除）時，
       * `ObjectNode` 因為 `if (!object.visible) return null` 整個卸載，
       * 場景圖裡的節點消失，而 `target.params`/`transform` 完全沒變（隱藏
       * 不影響這兩者），key 跟上一幀相同，於是在走到這段檢查之前就先
       * return 了——標註因此懸空留在畫面上，指著一個已經看不見的物件。
       *
       * 「全部物件」模式下隱藏的物件本來就不在 `targets` 裡（已經被
       * `visible !== false` 濾掉，走上面的孤兒清除），但「選取物件」模式
       * 下選取的物件本身被刪除/隱藏、或節點因為其他競態從場景圖消失時，
       * 這裡仍是最後一道防線。
       */
      const node = scene.getObjectByName(target.id)
      if (!node) {
        dirtyRef.current.forget(target.id)
        removePlacement(target.id)
        continue
      }

      const key = `${JSON.stringify(target.params)}|${target.transform.position.join(',')}|${target.transform.rotationY}`
      if (!dirtyRef.current.isDirty(target.id, key)) continue

      const bounds = measureLocalBounds(node)
      if (!bounds) {
        removePlacement(target.id)
        continue
      }
      const next: Placement = {
        lines: buildDimensions(
          [bounds.size.x, bounds.size.y, bounds.size.z],
          [bounds.center.x, bounds.center.y, bounds.center.z],
        ),
        position: target.transform.position,
        rotationY: target.transform.rotationY,
      }
      const current = placementsRef.current[target.id]
      if (!current || !samePlacement(current, next)) setPlacement(target.id, next)
    }
  })

  if (dimensionMode === 'off') return null
  // 「選取物件」模式下只顯示選取中那一個的標註，即使 `placements` map 裡
  // 因為單一幀的時間差還留著別的 id（下一幀的 useFrame 會清掉），渲染這裡
  // 再過濾一次，避免那一幀的閃現。
  const ids = dimensionMode === 'selected' ? (selectedId && placements[selectedId] ? [selectedId] : []) : Object.keys(placements)
  if (ids.length === 0) return null

  return (
    <>
      {ids.map((id) => {
        const placement = placements[id]
        return (
          <group key={id} position={placement.position} rotation={[0, placement.rotationY, 0]}>
            {placement.lines.map((l) => (
              <group key={l.axis}>
                <Line points={[l.from, l.to]} color={colors.dimensionLine} lineWidth={1.5} />
                {/*
                  `Html`（drei）渲染的是疊加在 Canvas 上方的真實 DOM <div>，
                  不屬於 WebGL 場景本身，`gl.domElement.toBlob()` 擷取畫面時只會
                  抓到這裡的 `Line`（貨真價實的 WebGL 幾何，會入鏡），這個 <div>
                  不會出現在截圖裡。這是刻意的取捨（用 Html 換取「永遠面向鏡頭、
                  不用打包字型」），細節記在 task-21-report.md。
                  截圖時的解法：擷取畫面那一刻另外把公分數字畫回合成用的 2D
                  canvas——用這裡（`dimensionsBridge.ts`）鏡射出去的
                  `placements` map 算出每個物件、每個標籤的世界座標，投影到
                  螢幕像素，`fillText` 疊上去。互動時的 `Html` 渲染完全不受
                  影響，只是在截圖那一刻多做一次合成。見 `useScreenshot.ts`
                  的 `composeDimensionLabels`。

                  刻意**不**帶 `distanceFactor`：drei 原本用 `distanceFactor`
                  讓這個 <div> 依「相機到物件的距離」縮放，鏡頭拉近字變大、
                  拉遠字變小，模擬 3D 空間裡的物件。但 `composeDimensionLabels`
                  合成截圖用的字級只吃 `pixelRatio` 與截圖倍率，沒有（也不該）
                  重新實作 drei 內部這套距離縮放公式（會耦合到 drei 版本、
                  drei 一改內部算法就對不上）。改成不帶 `distanceFactor`：
                  這個 <div> 永遠是畫面上固定的 CSS 像素大小，不隨鏡頭距離
                  變化，跟 `composeDimensionLabels` 用固定 `labelFontSizePx`
                  疊字的行為天生一致，兩邊不會有任何算法需要對齊。
                */}
                <Html position={l.labelPos} center zIndexRange={[10, 0]}>
                  <div
                    style={{
                      background: colors.labelBg,
                      color: colors.labelText,
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontFamily: 'system-ui, sans-serif',
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                    }}
                  >
                    {l.labelCm} cm
                  </div>
                </Html>
              </group>
            ))}
          </group>
        )
      })}
    </>
  )
}
