import { newId } from '../lib/id'
import { FINISHES } from '../materials/finishes'
import { boxPlinthDef } from './cases/boxPlinth'
import { glassCaseDef } from './cases/glassCase'
import { openShelfDef } from './cases/openShelf'
import { backWallDef } from './cases/backWall'
import { humanFigureDef } from './figures/humanFigure'
import { chairDef } from './props/chair'
import { stoolDef } from './props/stool'
import { crateDef } from './props/crate'
import { sideCabinetDef } from './props/sideCabinet'
import { tableSignDef } from './props/tableSign'
import type { ObjectDef, ObjectKind, ParamValue, SceneObject, SurfaceSpec } from './types'

/**
 * kind 對應的物件定義。每新增一種物件就在這裡登記一筆，
 * 屬性面板、物件庫、存檔、拖曳都會自動支援。
 */
export const REGISTRY: Partial<Record<ObjectKind, ObjectDef>> = {
  boxPlinth: boxPlinthDef,
  glassCase: glassCaseDef,
  openShelf: openShelfDef,
  backWall: backWallDef,
  humanFigure: humanFigureDef,
  chair: chairDef,
  stool: stoolDef,
  crate: crateDef,
  sideCabinet: sideCabinetDef,
  tableSign: tableSignDef,
}

export function getDef(kind: ObjectKind): ObjectDef {
  const def = REGISTRY[kind]
  if (!def) throw new Error(`未註冊的物件種類：${kind}`)
  return def
}

/** 物件庫顯示順序，依註冊順序。 */
export function listDefs(category?: ObjectDef['category']): ObjectDef[] {
  const all = Object.values(REGISTRY).filter(Boolean) as ObjectDef[]
  return category ? all.filter((d) => d.category === category) : all
}

export function defaultParams(def: ObjectDef): Record<string, ParamValue> {
  const params: Record<string, ParamValue> = {}
  for (const p of def.schema) params[p.key] = p.default
  return params
}

function defaultSurfaces(def: ObjectDef): Record<string, SurfaceSpec> {
  const surfaces: Record<string, SurfaceSpec> = {}
  for (const s of def.surfaces) {
    surfaces[s.id] = {
      finish: s.defaultFinish,
      color: FINISHES[s.defaultFinish].suggestedColor,
    }
  }
  return surfaces
}

/** 判斷某個參數在目前參數組合下是否該顯示。 */
export function isParamVisible(
  def: ObjectDef,
  key: string,
  params: Record<string, ParamValue>,
): boolean {
  const p = def.schema.find((s) => s.key === key)
  if (!p?.visibleWhen) return true
  return p.visibleWhen(params)
}

export function createObject(kind: ObjectKind): SceneObject {
  const def = getDef(kind)
  return {
    id: newId(kind),
    kind,
    name: def.label,
    params: defaultParams(def),
    transform: {
      position: [...def.defaultTransform.position],
      rotationY: def.defaultTransform.rotationY,
    },
    surfaces: defaultSurfaces(def),
    visible: true,
    locked: false,
  }
}
