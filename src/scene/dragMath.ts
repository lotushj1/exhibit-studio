import { snapTo } from '../lib/units'

/** 按住 Shift 時的貼齊步距：10 公分。 */
export const SNAP_STEP_M = 0.1

/**
 * 把地面平面上的位移套用到物件位置。
 * Y 永遠不動，物件一律站在原本的高度上。
 */
export function applyDrag(
  start: [number, number, number],
  deltaXZ: [number, number],
  snap: boolean,
): [number, number, number] {
  if (!Number.isFinite(deltaXZ[0]) || !Number.isFinite(deltaXZ[1])) return [...start]
  const x = start[0] + deltaXZ[0]
  const z = start[2] + deltaXZ[1]
  return snap ? [snapTo(x, SNAP_STEP_M), start[1], snapTo(z, SNAP_STEP_M)] : [x, start[1], z]
}
