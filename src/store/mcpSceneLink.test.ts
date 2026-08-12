import { describe, expect, it } from 'vitest'
import { createObject } from '../objects/registry'
import {
  MCP_LINK_MAX_LENGTH,
  buildMcpSceneLink,
  decodeMcpProject,
} from './mcpSceneLink'

describe('MCP scene links', () => {
  it('round-trips UTF-8 project payloads as base64url without padding', () => {
    const project = {
      version: 1,
      projectName: '展覽：中文場景',
      objects: [createObject('boxPlinth')],
      assets: [],
    }
    const link = buildMcpSceneLink(project)
    expect(link).toMatch(/^https:\/\/exhibit-studio\.vercel\.app\/#mcp=[A-Za-z0-9_-]+$/)
    expect(link.split('#mcp=')[1]).not.toContain('=')
    expect(decodeMcpProject(link)).toEqual({ project })
  })

  it('rejects payloads with assets, malformed hashes, and oversized links', () => {
    const project = {
      version: 1,
      projectName: 'x',
      objects: [],
      assets: [{ id: 'asset', name: 'x', widthPx: 1, heightPx: 1, dataUrl: 'data:image/png;base64,AA' }],
    }
    expect(() => buildMcpSceneLink(project)).toThrow(/assets/)
    expect(decodeMcpProject('#mcp=not.valid')).toEqual({ error: expect.any(String) })
    expect(decodeMcpProject(`#mcp=${'A'.repeat(MCP_LINK_MAX_LENGTH)}`)).toEqual({ error: expect.any(String) })
  })

  it('only accepts the mcp hash and does not leak malformed payloads in errors', () => {
    expect(decodeMcpProject('#other=secret')).toEqual({ ignored: true })
    const result = decodeMcpProject('#mcp=eyJ2ZXJzaW9uIjo5OTksInN0ZW5zIjoiU0VDUkVUIiwib2JqZWN0cyI6W10sImFzc2V0cyI6W119')
    expect(result).toEqual({ error: expect.any(String) })
    if ('error' in result) expect(result.error).not.toContain('SECRET')
  })

  it('rejects duplicate object ids from hand-authored links without leaking payload data', () => {
    const object = createObject('boxPlinth')
    const link = buildMcpSceneLink({
      version: 1,
      projectName: '重複 ID 私密場景',
      objects: [object, { ...createObject('chair'), id: object.id }],
      assets: [],
    })
    const result = decodeMcpProject(link)
    expect(result).toEqual({ error: expect.any(String) })
    if ('error' in result) {
      expect(result.error).toContain('id')
      expect(result.error).not.toContain('重複 ID 私密場景')
      expect(result.error).not.toContain(object.id)
    }
  })

  it('rejects texture references even when the assets array is empty', () => {
    const object = createObject('boxPlinth')
    object.surfaces.front.texture = {
      assetId: 'private-texture-id',
      fit: 'cover',
      offset: [0, 0],
      scale: 1,
      rotation: 0,
      unlit: false,
    }
    const link = buildMcpSceneLink({
      version: 1,
      projectName: '貼圖私密場景',
      objects: [object],
      assets: [],
    })
    const result = decodeMcpProject(link)
    expect(result).toEqual({ error: expect.any(String) })
    if ('error' in result) {
      expect(result.error).toContain('貼圖')
      expect(result.error).not.toContain('private-texture-id')
    }
  })
})
