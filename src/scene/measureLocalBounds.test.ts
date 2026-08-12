import { describe, it, expect } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { measureLocalBounds } from './measureLocalBounds'

/**
 * 建一個假的節點樹：一個 group（可以有自己的 position/rotation，模擬
 * `ObjectNode`/`Dimensions` 傳進 `measureLocalBounds` 的那個節點），底下
 * 掛一個尺寸固定的 box 網格，網格本身相對節點再做一個小平移（模擬展台
 * 踢腳墊高之類「內容不是剛好貼在節點原點」的真實情況）。
 */
function buildNode(rotationY: number, position: [number, number, number] = [0, 0, 0]) {
  const node = new Group()
  node.position.set(...position)
  node.rotation.y = rotationY

  const mesh = new Mesh(new BoxGeometry(1.2, 0.9, 0.6), new MeshBasicMaterial())
  mesh.position.set(0, 0.45, 0)
  node.add(mesh)

  node.updateMatrixWorld(true)
  return node
}

describe('measureLocalBounds', () => {
  it('物件旋轉 0 度與 45 度，量到的本地尺寸相同（不受旋轉影響）', () => {
    const flat = buildNode(0)
    const rotated = buildNode(Math.PI / 4)

    const boundsFlat = measureLocalBounds(flat)
    const boundsRotated = measureLocalBounds(rotated)

    expect(boundsFlat).not.toBeNull()
    expect(boundsRotated).not.toBeNull()
    expect(boundsRotated!.size.x).toBeCloseTo(boundsFlat!.size.x, 6)
    expect(boundsRotated!.size.y).toBeCloseTo(boundsFlat!.size.y, 6)
    expect(boundsRotated!.size.z).toBeCloseTo(boundsFlat!.size.z, 6)
    // 尺寸應該精確等於幾何本身的尺寸（120/90/60cm 換算成公尺）。
    expect(boundsFlat!.size.x).toBeCloseTo(1.2, 6)
    expect(boundsFlat!.size.y).toBeCloseTo(0.9, 6)
    expect(boundsFlat!.size.z).toBeCloseTo(0.6, 6)
  })

  it('本地座標的中心不受節點自己的旋轉影響', () => {
    const flat = buildNode(0)
    const rotated = buildNode((Math.PI * 2) / 3)

    const boundsFlat = measureLocalBounds(flat)!
    const boundsRotated = measureLocalBounds(rotated)!

    expect(boundsRotated.center.x).toBeCloseTo(boundsFlat.center.x, 6)
    expect(boundsRotated.center.y).toBeCloseTo(boundsFlat.center.y, 6)
    expect(boundsRotated.center.z).toBeCloseTo(boundsFlat.center.z, 6)
    // 網格相對節點平移了 [0, 0.45, 0]，本地中心應該正好量到這個位移。
    expect(boundsFlat.center.x).toBeCloseTo(0, 6)
    expect(boundsFlat.center.y).toBeCloseTo(0.45, 6)
    expect(boundsFlat.center.z).toBeCloseTo(0, 6)
  })

  it('節點本身平移到別的世界座標，量到的本地尺寸與中心不變', () => {
    const here = buildNode(0, [0, 0, 0])
    const there = buildNode(Math.PI / 5, [5, 2, -3])

    const a = measureLocalBounds(here)!
    const b = measureLocalBounds(there)!

    expect(b.size.x).toBeCloseTo(a.size.x, 6)
    expect(b.size.y).toBeCloseTo(a.size.y, 6)
    expect(b.size.z).toBeCloseTo(a.size.z, 6)
    expect(b.center.x).toBeCloseTo(a.center.x, 6)
    expect(b.center.y).toBeCloseTo(a.center.y, 6)
    expect(b.center.z).toBeCloseTo(a.center.z, 6)
  })

  it('節點底下沒有任何網格時回傳 null', () => {
    const empty = new Group()
    empty.updateMatrixWorld(true)
    expect(measureLocalBounds(empty)).toBeNull()
  })
})
