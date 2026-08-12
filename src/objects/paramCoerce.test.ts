import { describe, it, expect } from 'vitest'
import { coerceParam } from './paramCoerce'
import type { ParamDef } from './types'

const numberParam: ParamDef = {
  key: 'heightCm', label: '總高', type: 'number', min: 60, max: 300, step: 1, unit: 'cm', default: 180,
}

// select 型但沒有定義 `options`：型別比對仍要成立，但不該套用 options 檢查
// （目前 codebase 沒有這種用法，但 `options` 在型別上是可選欄位，
// `coerceParam` 不該假設它一定存在）。
const selectParamWithoutOptions: ParamDef = {
  key: 'label', label: '標籤', type: 'select', default: 'x',
}

const boolParam: ParamDef = {
  key: 'showBase', label: '顯示底座', type: 'boolean', default: true,
}

const selectParam: ParamDef = {
  key: 'build', label: '體型', type: 'select', default: 'male',
  options: [
    { value: 'male', label: '男性' },
    { value: 'female', label: '女性' },
    { value: 'child', label: '兒童' },
  ],
}

describe('coerceParam：夾制（number 型別，min/max）', () => {
  it('數值在範圍內：原樣回傳', () => {
    expect(coerceParam(numberParam, 200)).toBe(200)
  })

  it('數值超過 max：夾到 max', () => {
    expect(coerceParam(numberParam, 999)).toBe(300)
  })

  it('數值低於 min：夾到 min', () => {
    expect(coerceParam(numberParam, 10)).toBe(60)
  })

  it('沒有 min/max 的 number 參數：不夾制，原樣回傳', () => {
    const unbounded: ParamDef = { key: 'girth', label: '胖瘦', type: 'number', default: 1 }
    expect(coerceParam(unbounded, 999999)).toBe(999999)
    expect(coerceParam(unbounded, -999999)).toBe(-999999)
  })
})

describe('coerceParam：有限性（number 型別必須是有限值）', () => {
  it('NaN 回傳 undefined（typeof NaN === "number" 但不是有限值）', () => {
    expect(coerceParam(numberParam, NaN)).toBeUndefined()
  })

  it('Infinity 回傳 undefined', () => {
    expect(coerceParam(numberParam, Infinity)).toBeUndefined()
    expect(coerceParam(numberParam, -Infinity)).toBeUndefined()
  })
})

describe('coerceParam：型別不符', () => {
  it('number 參數收到字串：回傳 undefined', () => {
    expect(coerceParam(numberParam, '200')).toBeUndefined()
  })

  it('number 參數收到 null/undefined：回傳 undefined', () => {
    expect(coerceParam(numberParam, null)).toBeUndefined()
    expect(coerceParam(numberParam, undefined)).toBeUndefined()
  })

  it('boolean 參數收到字串：回傳 undefined', () => {
    expect(coerceParam(boolParam, 'true')).toBeUndefined()
  })

  it('boolean 參數收到符合型別的值：原樣回傳', () => {
    expect(coerceParam(boolParam, false)).toBe(false)
  })

  it('select 型參數但沒有定義 options，型別相符：原樣回傳（不受 options 檢查影響）', () => {
    expect(coerceParam(selectParamWithoutOptions, 'anything')).toBe('anything')
  })
})

describe('coerceParam：options 比對（Residual 2，select 型參數必須落在 options 之內）', () => {
  it('值在 options 之內：原樣回傳', () => {
    expect(coerceParam(selectParam, 'female')).toBe('female')
  })

  it('值不在 options 之內：回傳 undefined（即使型別是字串，跟 default 一致）', () => {
    expect(coerceParam(selectParam, 'nope')).toBeUndefined()
  })

  it('空字串（不在 options 之內）：回傳 undefined', () => {
    expect(coerceParam(selectParam, '')).toBeUndefined()
  })

  it('型別不符（數字）：回傳 undefined，不會走到 options 比對就先被型別擋下', () => {
    expect(coerceParam(selectParam, 42)).toBeUndefined()
  })
})
