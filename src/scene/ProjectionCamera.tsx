import { useLayoutEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { ProjectionMode } from '../store/sceneStore'

const CAMERA_POSITION = [3.2, 2.4, 3.8] as const
const CAMERA_NEAR = 0.05
const CAMERA_FAR = 200

export type ProjectionCameras = {
  perspective: THREE.PerspectiveCamera
  orthographic: THREE.OrthographicCamera
}

/** 建立一組可在同一個 WebGL context 內交換的相機。 */
export function createProjectionCameras(aspect = 1): ProjectionCameras {
  const perspective = new THREE.PerspectiveCamera(45, aspect, CAMERA_NEAR, CAMERA_FAR)
  perspective.position.set(...CAMERA_POSITION)
  perspective.lookAt(0, 0, 0)

  const orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, CAMERA_NEAR, CAMERA_FAR)
  orthographic.position.set(...CAMERA_POSITION)
  orthographic.zoom = 1
  orthographic.lookAt(0, 0, 0)

  return { perspective, orthographic }
}

/**
 * 將上一台相機的姿態帶到下一台相機，讓投影切換不會把使用者的視角歸零。
 * 投影參數（fov／zoom）則交給 CameraRig 依目前預設補間。
 */
export function copyCameraPose(from: THREE.Camera, to: THREE.Camera): void {
  to.position.copy(from.position)
  to.quaternion.copy(from.quaternion)
  to.up.copy(from.up)
  to.updateMatrixWorld()
}

/** 更新正交相機視埠；透視相機的 aspect 也要隨容器尺寸更新。 */
export function updateProjectionCameraFrustum(
  cameras: ProjectionCameras,
  width: number,
  height: number,
): void {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  cameras.perspective.aspect = safeWidth / safeHeight
  cameras.perspective.updateProjectionMatrix()
  cameras.orthographic.left = -safeWidth / 2
  cameras.orthographic.right = safeWidth / 2
  cameras.orthographic.top = safeHeight / 2
  cameras.orthographic.bottom = -safeHeight / 2
  cameras.orthographic.updateProjectionMatrix()
}

/**
 * 在 R3F 內交換 state.camera，而不卸載 Canvas 或 renderer。
 * `raycaster.camera` 也必須同步，否則點選／拖曳仍會用上一台相機投射射線。
 */
export function ProjectionCamera({ projection }: { projection: ProjectionMode }) {
  const { camera, raycaster, set, size } = useThree()
  const cameras = useMemo(() => createProjectionCameras(), [])
  const active = cameras[projection]

  useLayoutEffect(() => {
    updateProjectionCameraFrustum(cameras, size.width, size.height)
  }, [cameras, size.width, size.height])

  useLayoutEffect(() => {
    if (camera !== active) copyCameraPose(camera, active)
    set({ camera: active })
    raycaster.camera = active
  }, [active, camera, raycaster, set])

  return (
    <>
      <primitive object={cameras.perspective} />
      <primitive object={cameras.orthographic} />
    </>
  )
}
