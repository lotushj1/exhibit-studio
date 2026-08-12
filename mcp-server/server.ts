import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { coerceParam } from '../src/objects/paramCoerce'
import { createObject, getDef, listDefs } from '../src/objects/registry'
import type { ObjectKind, ParamValue, SceneObject } from '../src/objects/types'
import {
  MCP_LINK_MAX_LENGTH,
  MCP_OBJECT_LIMIT,
  buildMcpSceneLink,
  type McpProjectPayload,
} from '../src/store/mcpSceneLink'
import { createPresetScene, getPresetMetadata } from '../src/presets'
import { PROJECT_VERSION } from '../src/store/projectFile'

const MAX_PROJECT_NAME = 200
const MAX_STRING = 500
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

type SceneState = {
  projectName: string
  objects: SceneObject[]
}

const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
}).strict()

const objectInputShape = {
  kind: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(MAX_STRING).optional(),
  positionCm: positionSchema.optional(),
  rotationDeg: z.number().finite().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  surfaceColors: z.record(z.string(), z.string()).optional(),
}

const addObjectSchema = z.object(objectInputShape).strict()
const updateObjectSchema = z.object({
  id: z.string().min(1).max(MAX_STRING),
  name: z.string().trim().min(1).max(MAX_STRING).optional(),
  positionCm: positionSchema.optional(),
  rotationDeg: z.number().finite().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  surfaceColors: z.record(z.string(), z.string()).optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
}).strict()

const outputText = (value: unknown): string => JSON.stringify(value)

function ok<T extends Record<string, unknown>>(data: T, text = outputText(data)) {
  return { content: [{ type: 'text' as const, text }], structuredContent: data }
}

function fail(message: string) {
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: message }],
    structuredContent: { error: message },
  }
}

function cloneObject(object: SceneObject): SceneObject {
  return {
    ...object,
    params: { ...object.params },
    transform: {
      position: [...object.transform.position] as [number, number, number],
      rotationY: object.transform.rotationY,
    },
    surfaces: Object.fromEntries(Object.entries(object.surfaces).map(([id, surface]) => [id, { ...surface }])),
  }
}

function cloneObjects(objects: SceneObject[]): SceneObject[] {
  return objects.map(cloneObject)
}

function projectPayload(state: SceneState): McpProjectPayload {
  return {
    version: PROJECT_VERSION,
    projectName: state.projectName,
    objects: cloneObjects(state.objects),
    assets: [],
  }
}

function cleanProjectName(input: string | undefined): string {
  const value = input?.trim() || '未命名專案'
  return value.slice(0, MAX_PROJECT_NAME)
}

function toPositionCm(object: SceneObject) {
  return {
    x: object.transform.position[0] * 100,
    y: object.transform.position[1] * 100,
    z: object.transform.position[2] * 100,
  }
}

function objectSummary(object: SceneObject) {
  return {
    id: object.id,
    kind: object.kind,
    name: object.name,
    positionCm: toPositionCm(object),
    rotationDeg: object.transform.rotationY * 180 / Math.PI,
    visible: object.visible,
    locked: object.locked,
  }
}

function unknownKeys(record: Record<string, unknown>, allowed: readonly string[]): string[] {
  const allowedSet = new Set(allowed)
  return Object.keys(record).filter((key) => !allowedSet.has(key))
}

type ValidatedPatch = {
  name?: string
  position?: [number, number, number]
  rotationY?: number
  params?: Record<string, ParamValue>
  surfaceColors?: Record<string, string>
}

function validateObjectPatch(
  kind: ObjectKind,
  input: {
    name?: string
    positionCm?: { x: number; y: number; z: number }
    rotationDeg?: number
    params?: Record<string, unknown>
    surfaceColors?: Record<string, string>
  },
): { patch: ValidatedPatch } | { error: string } {
  const def = getDef(kind)
  const patch: ValidatedPatch = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.positionCm) {
    patch.position = [input.positionCm.x / 100, input.positionCm.y / 100, input.positionCm.z / 100]
  }
  if (input.rotationDeg !== undefined) patch.rotationY = input.rotationDeg * Math.PI / 180

  const params: Record<string, ParamValue> = {}
  if (input.params !== undefined) {
    const known = new Set(def.schema.map((param) => param.key))
    const unknown = unknownKeys(input.params, [...known])
    if (unknown.length > 0) return { error: `未知參數：${unknown.join(', ')}` }
    for (const [key, value] of Object.entries(input.params)) {
      const paramDef = def.schema.find((param) => param.key === key)!
      const coerced = coerceParam(paramDef, value)
      if (coerced === undefined) return { error: `參數 ${key} 的型別或選項不合法` }
      params[key] = coerced
    }
    patch.params = params
  }

  if (input.surfaceColors !== undefined) {
    const known = new Set(def.surfaces.map((surface) => surface.id))
    const unknown = unknownKeys(input.surfaceColors, [...known])
    if (unknown.length > 0) return { error: `未知材質面：${unknown.join(', ')}` }
    for (const [surfaceId, color] of Object.entries(input.surfaceColors)) {
      if (!HEX_COLOR.test(color)) return { error: `材質面 ${surfaceId} 的顏色必須是六碼十六進位色碼` }
    }
    patch.surfaceColors = { ...input.surfaceColors }
  }
  return { patch }
}

function applyPatch(object: SceneObject, patch: ValidatedPatch): SceneObject {
  const next = cloneObject(object)
  if (patch.name !== undefined) next.name = patch.name
  if (patch.position !== undefined) next.transform.position = patch.position
  if (patch.rotationY !== undefined) next.transform.rotationY = patch.rotationY
  if (patch.params) {
    const def = getDef(next.kind)
    for (const [key, value] of Object.entries(patch.params)) {
      next.params[key] = value
      const paramDef = def.schema.find((param) => param.key === key)
      if (paramDef?.sideEffect) {
        const effects = paramDef.sideEffect(value, next.params)
        for (const [effectKey, effectValue] of Object.entries(effects)) {
          const effectDef = def.schema.find((param) => param.key === effectKey)
          if (effectDef) next.params[effectKey] = coerceParam(effectDef, effectValue) ?? next.params[effectKey]
        }
      }
    }
  }
  if (patch.surfaceColors) {
    for (const [surfaceId, color] of Object.entries(patch.surfaceColors)) {
      next.surfaces[surfaceId] = { ...next.surfaces[surfaceId], color }
    }
  }
  return next
}

function listComponents() {
  return listDefs().map((def) => ({
    kind: def.kind,
    label: def.label,
    category: def.category,
    params: def.schema.map(({ key, label, type, min, max, step, unit, options, default: defaultValue }) => ({
      key, label, type, min, max, step, unit, options, default: defaultValue,
    })),
    surfaces: def.surfaces.map(({ id, label, defaultFinish }) => ({ id, label, defaultFinish })),
  }))
}

export function createServer() {
  let state: SceneState = { projectName: '未命名專案', objects: [] }
  const server = new McpServer({ name: 'exhibit-studio-local', version: '1.0.0' })

  server.registerTool('list_components', {
    title: '列出元件',
    description: '列出 Exhibit Studio registry 中目前可建立的元件、參數與材質面。',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({}).strict(),
  }, async () => ok({ components: listComponents() }))

  server.registerTool('new_scene', {
    title: '建立新場景',
    description: '清空 MCP connection 的場景並設定專案名稱。',
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: z.object({ projectName: z.string().trim().min(1).max(MAX_PROJECT_NAME).optional() }).strict(),
  }, async ({ projectName }) => {
    state = { projectName: cleanProjectName(projectName), objects: [] }
    return ok({ projectName: state.projectName, objectCount: 0 })
  })

  server.registerTool('apply_preset', {
    title: '套用場景範本',
    description: '套用四個內建場景範本；未知 id 不會改變目前場景。',
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: z.object({ id: z.string().min(1).max(MAX_STRING) }).strict(),
  }, async ({ id }) => {
    const scene = createPresetScene(id)
    const metadata = getPresetMetadata(id)
    if (!scene || !metadata) return fail(`未知範本 id：${id}`)
    if (scene.objects.length > MCP_OBJECT_LIMIT) return fail(`範本超過 ${MCP_OBJECT_LIMIT} 個物件上限`)
    state = { projectName: scene.projectName, objects: cloneObjects(scene.objects) }
    return ok({ projectName: state.projectName, objectCount: state.objects.length, presetId: id })
  })

  server.registerTool('add_object', {
    title: '新增物件',
    description: '使用 registry schema 驗證後新增物件；MCP 位置單位為公分、旋轉為角度。',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: addObjectSchema,
  }, async (input) => {
    if (state.objects.length >= MCP_OBJECT_LIMIT) return fail(`場景最多 ${MCP_OBJECT_LIMIT} 個物件`)
    if (!listDefs().some((def) => def.kind === input.kind)) return fail(`未知物件種類：${input.kind}`)
    const kind = input.kind as ObjectKind
    const validated = validateObjectPatch(kind, input)
    if ('error' in validated) return fail(validated.error)
    const object = applyPatch(createObject(kind), validated.patch)
    state = { ...state, objects: [...state.objects, object] }
    return ok({ object: objectSummary(object), objectCount: state.objects.length })
  })

  server.registerTool('update_object', {
    title: '更新物件',
    description: '以 id 原子更新物件；找不到 id 或欄位不合法時不改變場景。',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: updateObjectSchema,
  }, async (input) => {
    const index = state.objects.findIndex((object) => object.id === input.id)
    if (index < 0) return fail(`找不到物件 id：${input.id}`)
    const mutableKeys = ['name', 'positionCm', 'rotationDeg', 'params', 'surfaceColors', 'visible', 'locked'] as const
    if (!mutableKeys.some((key) => input[key] !== undefined)) return fail('至少提供一個要更新的欄位')
    const validated = validateObjectPatch(state.objects[index].kind, input)
    if ('error' in validated) return fail(validated.error)
    const nextObject = applyPatch(state.objects[index], validated.patch)
    if (input.visible !== undefined) nextObject.visible = input.visible
    if (input.locked !== undefined) nextObject.locked = input.locked
    const objects = cloneObjects(state.objects)
    objects[index] = nextObject
    state = { ...state, objects }
    return ok({ object: objectSummary(nextObject), objectCount: state.objects.length })
  })

  server.registerTool('remove_object', {
    title: '移除物件',
    description: '依 id 移除物件；找不到 id 時不改變場景。',
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: z.object({ id: z.string().min(1).max(MAX_STRING) }).strict(),
  }, async ({ id }) => {
    if (!state.objects.some((object) => object.id === id)) return fail(`找不到物件 id：${id}`)
    state = { ...state, objects: state.objects.filter((object) => object.id !== id) }
    return ok({ removedId: id, objectCount: state.objects.length })
  })

  server.registerTool('get_scene', {
    title: '取得目前場景',
    description: '回傳場景摘要與可由 Exhibit Studio 讀取的 v1 project payload。',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({}).strict(),
  }, async () => ok({
    projectName: state.projectName,
    objectCount: state.objects.length,
    objects: state.objects.map(objectSummary),
    project: projectPayload(state),
  }))

  server.registerTool('open_scene', {
    title: '開啟場景連結',
    description: '產生安全 Exhibit Studio 深連結；使用者確認取代目前場景後才會載入。',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: z.object({}).strict(),
  }, async () => {
    const project = projectPayload(state)
    try {
      const baseUrl = process.env.EXHIBIT_STUDIO_URL || undefined
      const link = buildMcpSceneLink(project, baseUrl)
      if (link.length > MCP_LINK_MAX_LENGTH) return fail('MCP 深連結過長，已停止產生')
      return ok({ url: link, project, objectCount: state.objects.length }, `Exhibit Studio 深連結（開啟前會顯示取代警告）：${link}`)
    } catch {
      return fail('無法產生安全的 Exhibit Studio 深連結')
    }
  })

  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  serveStdio(createServer, {
    onerror: (error) => console.error('[exhibit-studio-mcp]', error.message),
  })
}
