import { describe, it, expect } from 'vitest'
import { REGISTRY, getDef, createObject, defaultParams, isParamVisible } from './registry'
import { FINISHES } from '../materials/finishes'
import type { ObjectDef } from './types'

const defs = Object.values(REGISTRY).filter(Boolean) as ObjectDef[]

describe('registry 完整性', () => {
  it('至少註冊一種物件', () => {
    expect(defs.length).toBeGreaterThan(0)
  })

  it('每個 def 的 kind 與其索引鍵一致', () => {
    for (const [key, def] of Object.entries(REGISTRY)) {
      if (def) expect(def.kind).toBe(key)
    }
  })

  it('每個數值參數的預設值都落在 min 與 max 之間', () => {
    for (const def of defs) {
      for (const p of def.schema) {
        if (p.type !== 'number') continue
        expect(typeof p.default).toBe('number')
        expect(p.min).toBeDefined()
        expect(p.max).toBeDefined()
        expect(p.default as number).toBeGreaterThanOrEqual(p.min!)
        expect(p.default as number).toBeLessThanOrEqual(p.max!)
        expect(p.min!).toBeLessThan(p.max!)
      }
    }
  })

  it('每個 select 參數的預設值都在 options 之中', () => {
    for (const def of defs) {
      for (const p of def.schema) {
        if (p.type !== 'select') continue
        expect(p.options?.length).toBeGreaterThan(0)
        expect(p.options!.map((o) => o.value)).toContain(p.default)
      }
    }
  })

  it('參數 key 在同一個 def 內不重複', () => {
    for (const def of defs) {
      const keys = def.schema.map((p) => p.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('每個 surface 都有存在的預設材質，且 id 不重複', () => {
    for (const def of defs) {
      expect(def.surfaces.length).toBeGreaterThan(0)
      const ids = def.surfaces.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const s of def.surfaces) {
        expect(FINISHES[s.defaultFinish]).toBeDefined()
      }
    }
  })

  it('每個 def 都有繁體中文標籤且分類合法', () => {
    for (const def of defs) {
      expect(def.label.length).toBeGreaterThan(0)
      expect(['case', 'figure', 'prop']).toContain(def.category)
      for (const p of def.schema) expect(p.label.length).toBeGreaterThan(0)
      for (const s of def.surfaces) expect(s.label.length).toBeGreaterThan(0)
    }
  })

  it('物件標籤與參數標籤不含破折號', () => {
    for (const def of defs) {
      expect(def.label).not.toMatch(/[—–]/)
      for (const p of def.schema) expect(p.label).not.toMatch(/[—–]/)
      for (const s of def.surfaces) expect(s.label).not.toMatch(/[—–]/)
    }
  })

  it('visibleWhen 在預設參數下不拋錯', () => {
    for (const def of defs) {
      const params = defaultParams(def)
      for (const p of def.schema) {
        expect(() => isParamVisible(def, p.key, params)).not.toThrow()
      }
    }
  })
})

describe('createObject', () => {
  it('用預設參數與預設材質建立物件', () => {
    for (const def of defs) {
      const obj = createObject(def.kind)
      expect(obj.kind).toBe(def.kind)
      expect(obj.id.length).toBeGreaterThan(0)
      expect(obj.name).toBe(def.label)
      expect(obj.visible).toBe(true)
      expect(obj.locked).toBe(false)
      expect(obj.transform.rotationY).toBe(0)
      for (const p of def.schema) {
        expect(obj.params[p.key]).toEqual(p.default)
      }
      for (const s of def.surfaces) {
        expect(obj.surfaces[s.id].finish).toBe(s.defaultFinish)
        expect(obj.surfaces[s.id].color).toMatch(/^#[0-9a-fA-F]{6}$/)
        expect(obj.surfaces[s.id].texture).toBeUndefined()
      }
    }
  })

  it('連續建立的物件 id 不重複', () => {
    const kind = defs[0].kind
    const ids = new Set([createObject(kind).id, createObject(kind).id, createObject(kind).id])
    expect(ids.size).toBe(3)
  })
})

describe('getDef', () => {
  it('未註冊的 kind 拋出明確錯誤', () => {
    expect(() => getDef('notAKind' as never)).toThrow(/未註冊/)
  })
})
