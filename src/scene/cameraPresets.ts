import type { CameraPresetId, ProjectionMode } from '../store/sceneStore'

export type CameraPreset = {
  label: string
  /** 單位方向向量，實際距離由場景大小決定。 */
  direction: [number, number, number]
  /** 注視點的高度（公尺）。null 代表依場景高度自動。 */
  targetY: number | null
  fov: number
  /** 相機高度固定值（公尺）。設定後覆寫 direction 的 Y。 */
  fixedY?: number
}

/** 50mm 等效焦距在 36mm 全片幅上的垂直視角。 */
const FOV_50MM = 39.6

export const CAMERA_PRESETS: Record<CameraPresetId, CameraPreset> = {
  front: { label: '正視', direction: [0, 0.25, 1], targetY: null, fov: 35 },
  hero: { label: '主視角', direction: [0.75, 0.55, 0.95], targetY: null, fov: 45 },
  top: { label: '俯視', direction: [0, 1, 0], targetY: 0, fov: 45 },
  side: { label: '側視', direction: [1, 0.25, 0], targetY: null, fov: 35 },
  eye: { label: '人眼視角', direction: [0.35, 0, 1], targetY: 1.6, fov: FOV_50MM, fixedY: 1.6 },
}

export const CAMERA_ORDER: CameraPresetId[] = ['front', 'hero', 'top', 'side', 'eye']

/** CameraRig 用來清掉尚未完成的 0.6 秒補間；useKeyboard 在 Esc 時發出。 */
export const CAMERA_TRANSITION_CANCEL_EVENT = 'exhibit-studio:camera-transition-cancel'

/**
 * 發出相機補間取消事件。
 *
 * 把事件建立集中在這裡，讓鍵盤層不需要知道 CameraRig 的 ref 生命週期，
 * 也讓取消行為可以用一個最小的 EventTarget double 測試，不必在單元測試
 * 裡掛載整個 R3F Canvas。
 */
export function emitCameraTransitionCancel(target: Pick<EventTarget, 'dispatchEvent'>) {
  target.dispatchEvent(new Event(CAMERA_TRANSITION_CANCEL_EVENT))
}

const MIN_RADIUS_M = 1.2

/**
 * 正交模式下，「人眼視角」沒有意義：正交沒有透視收斂，1.6 公尺的相機高度
 * 與 50mm 等效焦距這兩個原本用來模擬真人站姿觀展視角的設定，在正交投影下
 * 不會呈現任何視覺效果（畫面看起來就是另一個固定角度的方塊，沒有「站在
 * 1.6 公尺高看出去」的感覺）。選擇讓它退化成「側視」的方向與注視高度，
 * 而不是整個停用這個預設：停用會讓頂列的五選一在正交模式下少一格可選、
 * 使用者剛好切到人眼視角時再切正交會發生「目前選取的預設消失了」這種
 * 不直覺的狀態；退化成側視則五個預設在任何投影模式下都維持可選、可框住
 * 場景、可截圖，代價只是「人眼視角」這個標籤在正交模式下跟側視長得一樣，
 * 使用者切過去會發現跟側視重複，但至少不會卡在一個算不出合理畫面的角度。
 */
function resolvePreset(id: CameraPresetId, projection: ProjectionMode): CameraPreset {
  if (projection === 'orthographic' && id === 'eye') return CAMERA_PRESETS.side
  return CAMERA_PRESETS[id]
}

/**
 * 依場景大小算出相機位置與注視點。
 * sceneRadiusM 是所有物件包圍盒的半徑，場景越大相機退越遠。
 *
 * `projection` 只影響「人眼視角」在正交模式下的退化（見 `resolvePreset`）；
 * 其餘四個預設的位置／注視點公式不分投影模式。回傳的 `fov` 在正交模式下
 * 呼叫端不會使用（正交相機沒有 fov，見 `CameraRig.tsx`），這裡仍然回傳
 * 完整的形狀只是為了讓兩種模式共用同一個回傳型別，不需要呼叫端另外判斷。
 */
export function framePreset(
  id: CameraPresetId,
  sceneRadiusM: number,
  projection: ProjectionMode = 'perspective',
): { position: [number, number, number]; target: [number, number, number]; fov: number } {
  const preset = resolvePreset(id, projection)
  const radius = Math.max(MIN_RADIUS_M, Number.isFinite(sceneRadiusM) ? sceneRadiusM : 0)
  const distance = radius * 2.6

  const [dx, dy, dz] = preset.direction
  const length = Math.hypot(dx, dy, dz) || 1
  const targetY = preset.targetY ?? radius * 0.45

  const position: [number, number, number] = [
    (dx / length) * distance,
    preset.fixedY ?? (dy / length) * distance + targetY,
    (dz / length) * distance,
  ]

  return { position, target: [0, targetY, 0], fov: preset.fov }
}

/**
 * 正交相機用的 zoom（取代透視相機的 fov／距離組合來控制畫面框住的範圍）。
 *
 * R3F 預設建立的正交相機，`left`/`right`/`top`/`bottom` 是視埠的像素數
 * （`left = size.width / -2`……見 `@react-three/fiber` 的相機建立邏輯），
 * `zoom` 把這個像素頻寬除下去才變成實際可視的世界範圍：可視世界半高
 * 等於 `(viewportHeightPx / 2) / zoom`。要讓場景不論多大都合理塞進畫面，
 * 這裡反過來，先算出「這個預設在透視模式下、以 `framePreset` 同一套距離
 * 公式站在該站的位置時，垂直方向看得到的世界半高」（`distance *
 * tan(fov/2)`），再換算成能讓正交相機看到同樣半高所需要的 zoom。這個
 * 半高刻意不隨相機到原點的實際距離變化——正交相機的「畫面裡東西多大」
 * 天生只由 zoom 決定，跟距離無關，所以直接把透視公式在對應距離算出來的
 * 半高當成正交模式的目標框景範圍，讓兩種投影切換時、同一個預設看起來的
 * 「框住程度」大致一致。
 */
export function orthoZoomForFrame(
  id: CameraPresetId,
  sceneRadiusM: number,
  viewportHeightPx: number,
  projection: ProjectionMode = 'orthographic',
): number {
  const preset = resolvePreset(id, projection)
  const radius = Math.max(MIN_RADIUS_M, Number.isFinite(sceneRadiusM) ? sceneRadiusM : 0)
  const distance = radius * 2.6
  const fovRad = (preset.fov * Math.PI) / 180
  const halfHeightM = distance * Math.tan(fovRad / 2)
  if (!Number.isFinite(halfHeightM) || halfHeightM <= 0) return 1
  return viewportHeightPx / 2 / halfHeightM
}
