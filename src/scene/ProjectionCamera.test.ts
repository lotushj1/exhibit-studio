import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  copyCameraPose,
  createProjectionCameras,
  updateProjectionCameraFrustum,
} from './ProjectionCamera'

describe('ProjectionCamera', () => {
  it('建立透視與正交兩種相機，供同一個 Canvas 交換使用', () => {
    const cameras = createProjectionCameras()

    expect(cameras.perspective).toBeInstanceOf(THREE.PerspectiveCamera)
    expect(cameras.orthographic).toBeInstanceOf(THREE.OrthographicCamera)
    expect(cameras.perspective.position.toArray()).toEqual([3.2, 2.4, 3.8])
    expect(cameras.orthographic.position.toArray()).toEqual([3.2, 2.4, 3.8])
  })

  it('交換時保留相機姿態，不重置 OrbitControls 看到的方向', () => {
    const cameras = createProjectionCameras()
    const source = cameras.perspective
    source.position.set(8, 4, -3)
    source.lookAt(1, 2, 3)
    const target = cameras.orthographic

    copyCameraPose(source, target)

    expect(target.position.toArray()).toEqual(source.position.toArray())
    expect(target.quaternion.toArray()).toEqual(source.quaternion.toArray())
    expect(target.up.toArray()).toEqual(source.up.toArray())
  })

  it('依 Canvas 尺寸更新兩種相機的投影矩陣', () => {
    const cameras = createProjectionCameras()
    updateProjectionCameraFrustum(cameras, 1200, 600)

    expect(cameras.perspective.aspect).toBe(2)
    expect(cameras.orthographic.left).toBe(-600)
    expect(cameras.orthographic.right).toBe(600)
    expect(cameras.orthographic.top).toBe(300)
    expect(cameras.orthographic.bottom).toBe(-300)
  })
})
