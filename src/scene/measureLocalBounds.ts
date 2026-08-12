import { Box3, Matrix4, Vector3, type Mesh, type Object3D } from 'three'

export type LocalBounds = { size: Vector3; center: Vector3 }

/**
 * 量測一個節點底下所有網格的包圍盒，結果換算回**節點自己的本地座標系**
 * （不含這個節點自己的 position／rotation）。
 *
 * Task 21 review 抓到的 bug：原本這裡是 `Box3.setFromObject(node)` 量世界
 * 座標，`ObjectNode` 再自己減掉 `object.transform.position` 換算回本地——
 * 但那樣做只扣得掉平移，扣不掉旋轉。這個專案的物件支援 Y 軸旋轉（Q/E
 * 快捷鍵、屬性面板角度欄位），世界座標的 AABB 是「軸對齊」的：一個
 * 120×40 公分的展台轉 45 度之後，世界座標包圍盒的寬會被撐大到約 113
 * 公分（對角線投影），不再是 120——用世界包圍盒去量「這個物件多大」只有
 * 在旋轉角度剛好是 0 時才對，一轉就錯。而且如果把這個算錯尺寸的方塊，
 * 畫在跟原物件同一個（已經旋轉過的）父節點底下當外框或標註線，等於把
 * 「用錯尺寸算出來的框」又轉了一次，看起來會更離譜。
 *
 * 正確作法：對節點底下每一個網格，取它的幾何本地包圍盒
 * （`geometry.boundingBox`），用「這個網格的 matrixWorld 乘上節點
 * matrixWorld 的反矩陣」轉換到節點的本地座標系再聯集。這樣量出來的尺寸
 * 完全不受節點自己（或任何祖先）的旋轉影響，永遠等於物件真實的長寬高，
 * 跟右側屬性面板的寬深高/ 身高一致。
 *
 * 呼叫前一律先 `node.updateWorldMatrix(true, false)`（`updateParents=true`）
 * 讓節點與祖先鏈的 matrixWorld 是最新的（Task 16 的老坑：單純讀
 * `matrixWorld` 不會自動做這件事，見專案內其他呼叫點的說明）；對每個子
 * 網格也各自呼叫一次 `updateWorldMatrix(true, false)`，確保節點與該網格
 * 之間的每一層中間 group（例如貼圖平面的位移群組）也都是最新的，不會
 * 因為只更新了 `node` 自己就漏掉中間層。
 *
 * 回傳 `null` 代表底下沒有任何網格（包圍盒是空的）。
 */
export function measureLocalBounds(node: Object3D): LocalBounds | null {
  node.updateWorldMatrix(true, false)
  const inverse = new Matrix4().copy(node.matrixWorld).invert()
  const box = new Box3()
  const meshLocalBox = new Box3()
  const meshToNode = new Matrix4()

  node.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    mesh.updateWorldMatrix(true, false)
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    const geometryBox = mesh.geometry.boundingBox
    if (!geometryBox) return
    meshLocalBox.copy(geometryBox)
    meshToNode.multiplyMatrices(inverse, mesh.matrixWorld)
    meshLocalBox.applyMatrix4(meshToNode)
    box.union(meshLocalBox)
  })

  if (box.isEmpty()) return null
  const size = new Vector3()
  const center = new Vector3()
  box.getSize(size)
  box.getCenter(center)
  return { size, center }
}
