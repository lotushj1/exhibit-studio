import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { decodeMcpProject } from '../src/store/mcpSceneLink'

const expectedTools = [
  'add_object',
  'apply_preset',
  'get_scene',
  'list_components',
  'new_scene',
  'open_scene',
  'remove_object',
  'update_object',
]
const expectedAnnotations: Record<string, { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean }> = {
  list_components: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  new_scene: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  apply_preset: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  add_object: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  update_object: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  remove_object: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  get_scene: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  open_scene: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--import', 'tsx/esm', 'mcp-server/server.ts'],
  cwd: process.cwd(),
  env: Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
  stderr: 'pipe',
})
const stderr: string[] = []
transport.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString()))

const client = new Client({ name: 'exhibit-studio-mcp-verifier', version: '1.0.0' })
await client.connect(transport)

const listed = await client.listTools()
const actualTools = listed.tools.map((tool) => tool.name).sort()
if (JSON.stringify(actualTools) !== JSON.stringify(expectedTools)) {
  throw new Error(`tool list mismatch: ${JSON.stringify(actualTools)}`)
}
for (const tool of listed.tools) {
  const expected = expectedAnnotations[tool.name]
  const annotations = tool.annotations as typeof expected | undefined
  if (!expected || !annotations || annotations.readOnlyHint !== expected.readOnlyHint
    || annotations.destructiveHint !== expected.destructiveHint || annotations.openWorldHint !== expected.openWorldHint) {
    throw new Error(`tool annotation mismatch: ${tool.name}`)
  }
}

const newScene = await client.callTool({ name: 'new_scene', arguments: { projectName: 'MCP 驗證場景' } })
if (newScene.isError) throw new Error('new_scene returned isError')
const added = await client.callTool({
  name: 'add_object',
  arguments: {
    kind: 'boxPlinth',
    name: '驗證展台',
    positionCm: { x: 125, y: 0, z: -40 },
    rotationDeg: 90,
    params: { widthCm: 200 },
    surfaceColors: { front: '#123456' },
  },
})
if (added.isError || !added.structuredContent || typeof added.structuredContent !== 'object') {
  throw new Error('add_object did not return structuredContent')
}
const addedData = added.structuredContent as { object?: { id?: string } }
if (!addedData.object?.id) throw new Error('add_object omitted object id')

const opened = await client.callTool({ name: 'open_scene', arguments: {} })
if (opened.isError || !opened.structuredContent || typeof opened.structuredContent !== 'object') {
  throw new Error('open_scene did not return structuredContent')
}
const openedData = opened.structuredContent as { url?: string; project?: { projectName?: string; objects?: unknown[]; assets?: unknown[] } }
if (!openedData.url || !openedData.url.includes('#mcp=')) throw new Error('open_scene omitted mcp link')
const decoded = decodeMcpProject(openedData.url)
if (!('project' in decoded) || decoded.project.projectName !== 'MCP 驗證場景' || decoded.project.objects.length !== 1 || decoded.project.assets.length !== 0) {
  throw new Error(`open_scene payload mismatch: ${JSON.stringify(decoded)}`)
}

const unknownPreset = await client.callTool({ name: 'apply_preset', arguments: { id: 'not-a-preset' } })
if (!unknownPreset.isError) throw new Error('unknown preset should return isError')

const invalidAdd = await client.callTool({ name: 'add_object', arguments: { kind: 'boxPlinth', params: { notAParam: 1 } } })
if (!invalidAdd.isError) throw new Error('unknown parameter should return isError')
const updated = await client.callTool({
  name: 'update_object',
  arguments: { id: addedData.object.id, positionCm: { x: 200, y: 0, z: -40 }, visible: false },
})
if (updated.isError) throw new Error('update_object returned isError')
const removed = await client.callTool({ name: 'remove_object', arguments: { id: addedData.object.id } })
if (removed.isError) throw new Error('remove_object returned isError')

await client.close()

// A second real stdio connection must start with an independent empty state.
const isolatedTransport = new StdioClientTransport({
  command: process.execPath,
  args: ['--import', 'tsx/esm', 'mcp-server/server.ts'],
  cwd: process.cwd(),
  env: Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
  stderr: 'pipe',
})
const isolatedClient = new Client({ name: 'exhibit-studio-mcp-isolation-verifier', version: '1.0.0' })
await isolatedClient.connect(isolatedTransport)
const isolatedScene = await isolatedClient.callTool({ name: 'get_scene', arguments: {} })
if (isolatedScene.isError || !isolatedScene.structuredContent || (isolatedScene.structuredContent as { objectCount?: number }).objectCount !== 0) {
  throw new Error('stdio connections do not have isolated scene state')
}
await isolatedClient.close()
console.log(`MCP handshake PASS: ${actualTools.length} tools; new_scene → add_object → open_scene; stderr=${stderr.length ? 'present' : 'clean'}`)
