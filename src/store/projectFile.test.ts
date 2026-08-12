import { describe, it, expect } from 'vitest'
import { parseProjectFile, PROJECT_VERSION } from './projectFile'
import { createObject } from '../objects/registry'

const validPayload = (overrides: Record<string, unknown> = {}) => {
  const obj = createObject('boxPlinth')
  return JSON.stringify({
    version: PROJECT_VERSION,
    projectName: '測試專案',
    objects: [obj],
    assets: [],
    ...overrides,
  })
}

describe('parseProjectFile', () => {
  it('讀入合法的專案檔', () => {
    const result = parseProjectFile(validPayload())
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.projectName).toBe('測試專案')
      expect(result.objects).toHaveLength(1)
      expect(result.assets).toEqual([])
    }
  })

  it('壞掉的 JSON 回傳錯誤訊息而不是拋錯', () => {
    const result = parseProjectFile('這不是 JSON')
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.length).toBeGreaterThan(0)
      expect(result.error).not.toMatch(/[—–]/)
    }
  })

  it('版本不符回傳錯誤訊息並說明版本', () => {
    const result = parseProjectFile(validPayload({ version: 99 }))
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.error).toContain('版本')
  })

  it('缺少 objects 陣列回傳錯誤訊息', () => {
    const raw = JSON.stringify({ version: PROJECT_VERSION, projectName: 'x', assets: [] })
    expect('error' in parseProjectFile(raw)).toBe(true)
  })

  it('assets 不是陣列時當作沒有貼圖，不視為錯誤', () => {
    const result = parseProjectFile(validPayload({ assets: 'nope' }))
    expect('error' in result).toBe(false)
    if (!('error' in result)) expect(result.assets).toEqual([])
  })

  it('略過欄位殘缺的 asset', () => {
    const result = parseProjectFile(
      validPayload({
        assets: [
          { id: 'a', name: 'x.png', widthPx: 100, heightPx: 50, dataUrl: 'data:image/png;base64,AA' },
          { id: 'b' },
          null,
        ],
      }),
    )
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.assets).toHaveLength(1)
      expect(result.assets[0].id).toBe('a')
    }
  })

  it('略過 kind 未註冊的物件', () => {
    const bad = { ...createObject('boxPlinth'), kind: 'nope' }
    const result = parseProjectFile(validPayload({ objects: [createObject('boxPlinth'), bad] }))
    expect('error' in result).toBe(false)
    if (!('error' in result)) expect(result.objects).toHaveLength(1)
  })

  it('dataUrl 不是 data:image/ 開頭（外部網址或非圖片 data URI）時該筆 asset 被濾掉', () => {
    const result = parseProjectFile(
      validPayload({
        assets: [
          { id: 'good', name: 'x.png', widthPx: 100, heightPx: 50, dataUrl: 'data:image/png;base64,AA' },
          { id: 'external-url', name: 'x.png', widthPx: 100, heightPx: 50, dataUrl: 'https://example.com/x.png' },
          { id: 'non-image', name: 'x.html', widthPx: 100, heightPx: 50, dataUrl: 'data:text/html,<script>1</script>' },
        ],
      }),
    )
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.assets).toHaveLength(1)
      expect(result.assets[0].id).toBe('good')
    }
  })
})
