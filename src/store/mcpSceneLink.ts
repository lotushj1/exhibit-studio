import { parseProjectFile, PROJECT_VERSION, type ProjectAsset } from './projectFile'
import type { SceneObject } from '../objects/types'

export const DEFAULT_MCP_BASE_URL = 'https://exhibit-studio.vercel.app/'
export const MCP_LINK_MAX_LENGTH = 60_000
export const MCP_OBJECT_LIMIT = 50

export type McpProjectPayload = {
  version: number
  projectName: string
  objects: SceneObject[]
  /** Input typing remains broad so malformed assets can be rejected explicitly. */
  assets: ProjectAsset[]
}

type DecodeResult =
  | { project: McpProjectPayload }
  | { ignored: true }
  | { error: string }

function fail(message: string): { error: string } {
  // Error strings are deliberately static. Never include the decoded payload,
  // URL or base64 text: MCP links may contain user-authored private content.
  return { error: message }
}

function encodeBase64Url(utf8: string): string {
  const bytes = new TextEncoder().encode(utf8)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(encoded: string): string | null {
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (encoded.length % 4)) % 4)
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

function isProjectPayload(value: unknown): value is Record<string, unknown> & {
  version: number
  projectName?: unknown
  objects: unknown[]
  assets: unknown[]
} {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).version === 'number'
    && Array.isArray((value as Record<string, unknown>).objects)
    && Array.isArray((value as Record<string, unknown>).assets)
}

function hasDuplicateObjectId(objects: unknown[]): boolean {
  const ids = new Set<string>()
  for (const object of objects) {
    if (typeof object !== 'object' || object === null || Array.isArray(object)) continue
    const id = (object as Record<string, unknown>).id
    if (typeof id !== 'string') continue
    if (ids.has(id)) return true
    ids.add(id)
  }
  return false
}

function hasTextureReference(objects: unknown[]): boolean {
  for (const object of objects) {
    if (typeof object !== 'object' || object === null || Array.isArray(object)) continue
    const surfaces = (object as Record<string, unknown>).surfaces
    if (typeof surfaces !== 'object' || surfaces === null || Array.isArray(surfaces)) continue
    for (const surface of Object.values(surfaces as Record<string, unknown>)) {
      if (typeof surface !== 'object' || surface === null || Array.isArray(surface)) continue
      if (Object.prototype.hasOwnProperty.call(surface, 'texture')) return true
    }
  }
  return false
}

function normaliseBaseUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('MCP base URL must be an HTTPS origin')
  }
  return parsed.toString().replace(/\/$/, '')
}

/**
 * Build the only deep-link format understood by Exhibit Studio.
 * `baseUrl` is an internal deployment override; MCP tool arguments never pass
 * through here and the server validates EXHIBIT_STUDIO_URL before using it.
 */
export function buildMcpSceneLink(project: McpProjectPayload, baseUrl = DEFAULT_MCP_BASE_URL): string {
  if (project.version !== PROJECT_VERSION || !Array.isArray(project.assets) || project.assets.length !== 0) {
    throw new Error('MCP 專案只支援 v1 且 assets 必須是空陣列')
  }
  if (!Array.isArray(project.objects) || project.objects.length > MCP_OBJECT_LIMIT) {
    throw new Error(`MCP 專案最多 ${MCP_OBJECT_LIMIT} 個物件`)
  }
  const link = `${normaliseBaseUrl(baseUrl)}/#mcp=${encodeBase64Url(JSON.stringify(project))}`
  if (link.length > MCP_LINK_MAX_LENGTH) throw new Error('MCP 深連結過長，請減少場景內容')
  return link
}

/**
 * Decode a full URL or hash and reconcile its objects through the same parser
 * used by regular project-file imports. Assets are intentionally rejected,
 * rather than silently filtered, because MCP MVP is local-first/no-assets.
 */
export function decodeMcpProject(input: string): DecodeResult {
  if (!input.includes('#mcp=')) return { ignored: true }
  if (input.length > MCP_LINK_MAX_LENGTH) return fail('MCP 深連結過長，無法匯入')
  const match = input.match(/#mcp=([^#&]*)$/)
  if (!match) return fail('MCP 深連結格式不正確，無法匯入')
  const rawText = decodeBase64Url(match[1])
  if (!rawText) return fail('MCP 深連結內容無法解碼，無法匯入')

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return fail('MCP 深連結內容不是合法專案，無法匯入')
  }
  if (!isProjectPayload(parsed) || parsed.version !== PROJECT_VERSION || parsed.assets.length !== 0) {
    return fail('MCP 深連結只支援 v1 且不含貼圖資產')
  }
  if (hasDuplicateObjectId(parsed.objects)) return fail('MCP 深連結含有重複物件 id')
  if (hasTextureReference(parsed.objects)) return fail('MCP 深連結不支援貼圖參照')
  if (parsed.objects.length > MCP_OBJECT_LIMIT) return fail(`MCP 深連結最多支援 ${MCP_OBJECT_LIMIT} 個物件`)

  const reconciled = parseProjectFile(JSON.stringify(parsed))
  if ('error' in reconciled) return fail('MCP 深連結的場景資料無法讀取')
  if (reconciled.assets.length !== 0 || reconciled.objects.length !== parsed.objects.length) {
    return fail('MCP 深連結含有無法讀取的場景資料')
  }
  return {
    project: {
      version: PROJECT_VERSION,
      projectName: reconciled.projectName,
      objects: reconciled.objects,
      assets: [],
    },
  }
}

// Keep this import in the module graph so generated declaration/type checks
// continue to catch accidental widening of the app's asset contract.
export type { ProjectAsset }
