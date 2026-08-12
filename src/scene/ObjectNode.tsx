import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Group } from 'three'
import { useSceneStore } from '../store/sceneStore'
import { useAppearanceStore } from '../store/appearanceStore'
import { getDef } from '../objects/registry'
import type { SceneObject } from '../objects/types'
import { useDragOnGround } from './useDragOnGround'
import { measureLocalBounds } from './measureLocalBounds'
import { SCENE_COLORS } from './sceneColors'

/**
 * 單一物件的錯誤邊界：一個物件炸掉不會讓整個畫面變白。
 *
 * `contentKey` 代表「這次要渲染的內容」（呼叫端傳 `JSON.stringify(object.params)`）。
 * `ObjectNode` 在 `Viewport` 裡用 `object.id` 當 key，改參數不會改 id、不會重新掛載，
 * 所以 boundary 進入 `failed` 狀態後，光是等 React 自然重新渲染是不會復原的——
 * 必須在 `componentDidUpdate` 主動偵測「內容變了」才把 `failed` 重設回 false，
 * 讓下一次 render 重新嘗試渲染 children。沒有這段，使用者把炸掉的參數調回正常值
 * 也救不回來，畫面會永遠空白，只能刪掉物件重加。
 */
class ObjectErrorBoundary extends Component<
  { children: ReactNode; name: string; contentKey: string },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('物件渲染失敗', this.props.name, error)
  }

  componentDidUpdate(prevProps: { contentKey: string }) {
    if (this.state.failed && prevProps.contentKey !== this.props.contentKey) {
      this.setState({ failed: false })
    }
  }

  render() {
    if (this.state.failed) return <FailedObjectMarker />
    return this.props.children
  }
}

/**
 * 失敗狀態的佔位標記：亮色線框小方塊，讓使用者知道「這裡有東西壞了」，
 * 而不是無聲消失、以為自己刪錯或參數調錯地方。
 */
function FailedObjectMarker() {
  return (
    <mesh position={[0, 0.15, 0]}>
      <boxGeometry args={[0.3, 0.3, 0.3]} />
      <meshBasicMaterial color="#ff3b30" wireframe />
    </mesh>
  )
}

export function ObjectNode({ object }: { object: SceneObject }) {
  const selectedId = useSceneStore((s) => s.selectedId)
  const def = getDef(object.kind)
  const isSelected = selectedId === object.id
  const drag = useDragOnGround(object.id, object.locked)
  const groupRef = useRef<Group>(null)
  const [box, setBox] = useState<{ size: [number, number, number]; center: [number, number, number] } | null>(null)

  // 選取時量出物件的實際包圍盒，畫成外框；改尺寸（params 變）或搬移
  // （transform.position 變，含拖曳中的即時更新）都要跟著重算。
  useEffect(() => {
    if (!isSelected || !groupRef.current) {
      setBox(null)
      return
    }
    // 用 `measureLocalBounds` 量本地座標包圍盒（完整說明見該檔案）：
    // `groupRef` 自己沒有 position/rotation（那是外層 `<group name={object.id}>`
    // 才有的），量出來的尺寸/中心天生就不受物件旋轉影響，也不需要再手動
    // 減掉 position——Task 21 review 抓到的坑：舊版用世界座標量、再減
    // position 換算本地，只扣得掉平移、扣不掉旋轉，物件轉 45 度之後外框
    // 會是撐大的世界 AABB，畫在同一個已經旋轉的父 group 裡又被轉一次，
    // 錯上加錯。
    const bounds = measureLocalBounds(groupRef.current)
    if (!bounds) return
    setBox({
      size: [bounds.size.x, bounds.size.y, bounds.size.z],
      center: [bounds.center.x, bounds.center.y, bounds.center.z],
    })
  }, [isSelected, object.params, object.transform.position, object.kind])

  if (!object.visible) return null

  return (
    <group
      name={object.id}
      position={object.transform.position}
      rotation={[0, object.transform.rotationY, 0]}
      {...drag}
    >
      <group ref={groupRef}>
        <ObjectErrorBoundary name={object.name} contentKey={JSON.stringify(object.params)}>
          <Suspense fallback={null}>
            <def.Render params={object.params} surfaces={object.surfaces} />
          </Suspense>
        </ObjectErrorBoundary>
      </group>
      {isSelected && box && <SelectionOutline size={box.size} center={box.center} />}
    </group>
  )
}

/**
 * 選取外框：包住物件實際包圍盒的線框，取代舊版的地面圓環。
 * 顏色跟著外觀切換——深色底用白線，淺色底用深線，不然淺色模式下白線會
 * 融進背景看不見（見 `sceneColors.ts`）。
 */
function SelectionOutline({ size, center }: { size: [number, number, number]; center: [number, number, number] }) {
  const appearance = useAppearanceStore((s) => s.appearance)
  const color = SCENE_COLORS[appearance].selectionOutline
  return (
    <mesh position={center}>
      <boxGeometry args={size} />
      <meshBasicMaterial color={color} wireframe transparent opacity={0.5} />
    </mesh>
  )
}
