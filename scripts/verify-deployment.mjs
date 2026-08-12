import { execFileSync } from 'node:child_process'

const EXPECTED_TITLE = 'Exhibit Studio 展場模擬'
const WEBGL_GATE_TEXT = '這個瀏覽器不支援 WebGL'
const AGENT_BROWSER = 'agent-browser'

function parseTargetUrl(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('請提供部署 URL')
  }

  const target = new URL(raw)
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
    throw new Error('URL 必須是沒有帳密的 HTTP 或 HTTPS 網址')
  }
  return target.href
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
}

function runAgent(session, args) {
  try {
    return execFileSync(AGENT_BROWSER, ['--session', session, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    throw new Error(`agent-browser ${args[0] ?? 'command'} 失敗`)
  }
}

function closeAgent(session) {
  try {
    execFileSync(AGENT_BROWSER, ['--session', session, 'close'], {
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'ignore'],
    })
  } catch {
    // 驗收失敗時也盡力關閉隔離 session；清理失敗不覆蓋原始結論。
  }
}

function parseJsonOutput(raw) {
  const text = stripAnsi(raw).trim()
  if (text.length === 0) return null

  const candidates = [text]
  const firstObject = text.indexOf('{')
  const lastObject = text.lastIndexOf('}')
  if (firstObject >= 0 && lastObject > firstObject) {
    candidates.push(text.slice(firstObject, lastObject + 1))
  }
  const firstArray = text.indexOf('[')
  const lastArray = text.lastIndexOf(']')
  if (firstArray >= 0 && lastArray > firstArray) {
    candidates.push(text.slice(firstArray, lastArray + 1))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (typeof parsed === 'string') return JSON.parse(parsed)
      return parsed
    } catch {
      // agent-browser 可能在 JSON 前後附帶一行狀態訊息，繼續嘗試下一段。
    }
  }
  return null
}

function collectEntries(value, entries = []) {
  if (Array.isArray(value)) {
    entries.push(...value)
    return entries
  }
  if (!value || typeof value !== 'object') return entries

  for (const key of ['data', 'entries', 'messages', 'console', 'errors']) {
    if (key in value) collectEntries(value[key], entries)
  }
  return entries
}

function hasPageErrors(raw) {
  const text = stripAnsi(raw).trim()
  if (text.length === 0 || /^(?:no (?:page )?errors?\.?|no errors found\.?|command completed with no output\.?)$/i.test(text)) {
    return false
  }

  const parsed = parseJsonOutput(text)
  if (parsed !== null) {
    const entries = collectEntries(parsed)
    if (entries.length > 0) return true
    if (Array.isArray(parsed)) return parsed.length > 0
  }
  return true
}

function consoleErrorEntries(raw) {
  const text = stripAnsi(raw).trim()
  if (text.length === 0) return []

  const parsed = parseJsonOutput(text)
  if (parsed !== null) {
    return collectEntries(parsed).filter((entry) => {
      if (!entry || typeof entry !== 'object') return false
      const level = String(entry.level ?? entry.type ?? entry.kind ?? '').toLowerCase()
      const message = String(entry.message ?? entry.text ?? entry.value ?? '')
      return level === 'error' || /\[error\]/i.test(message)
    })
  }

  return /(?:^|\s)error(?:\s|:)|\[error\]/i.test(text) ? [text] : []
}

function extractTitle(html) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  return match ? match[1].replace(/\s+/g, ' ').trim() : ''
}

function check(failures, label, condition) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`)
  if (!condition) failures.push(label)
}

async function main() {
  const targetUrl = parseTargetUrl(process.argv[2])
  const failures = []
  const session = `exhibit-deployment-${process.pid}-${Date.now()}`
  let browserStarted = false

  try {
    let response
    let html = ''
    try {
      response = await fetch(targetUrl, { redirect: 'follow' })
      html = await response.text()
      check(failures, 'HTTP redirect 追蹤後回傳 200', response.status === 200)
      check(failures, 'HTTP response 有正確 HTML title', extractTitle(html) === EXPECTED_TITLE)
    } catch {
      failures.push('HTTP 讀取部署網址失敗')
      console.log('FAIL  HTTP 讀取部署網址失敗')
    }

    try {
      browserStarted = true
      runAgent(session, ['open', targetUrl])
      runAgent(session, ['wait', '--load', 'networkidle'])
      runAgent(session, [
        'wait',
        '--fn',
        `document.querySelectorAll('canvas').length === 1 || document.body.innerText.includes(${JSON.stringify(WEBGL_GATE_TEXT)})`,
      ])

      const stateOutput = runAgent(session, [
        'eval',
        `JSON.stringify((() => {
          const canvases = [...document.querySelectorAll('canvas')]
          const contextKinds = canvases.map((canvas) => {
            const webgl2Context = canvas.getContext('webgl2')
            if (webgl2Context) return 'webgl2'
            return canvas.getContext('webgl') ? 'webgl' : null
          })
          const webgl2 = contextKinds.includes('webgl2')
          const webgl = contextKinds.includes('webgl')
          return {
            title: document.title,
            readyState: document.readyState,
            canvasCount: canvases.length,
            webgl2,
            webgl,
            webglContext: webgl2 || webgl,
            webglGate: document.body.innerText.includes(${JSON.stringify(WEBGL_GATE_TEXT)}),
            viteOverlay: Boolean(document.querySelector('vite-error-overlay, #vite-error-overlay, .vite-error-overlay')),
          }
        })())`,
      ])
      const state = parseJsonOutput(stateOutput)
      if (!state || typeof state !== 'object') {
        throw new Error('agent-browser eval 沒有回傳頁面狀態')
      }

      check(failures, '頁面 title 正確', state.title === EXPECTED_TITLE)
      check(failures, '頁面已完成載入', state.readyState === 'complete')
      check(failures, '頁面只有一個 Canvas', state.canvasCount === 1)
      check(failures, 'WebGL2 或 WebGL context 建立成功', state.webglContext === true)
      check(failures, '未落入 WebGLGate 說明頁', state.webglGate === false)
      check(failures, 'Vite error overlay 不存在', state.viteOverlay === false)

      const pageErrors = runAgent(session, ['errors'])
      check(failures, 'page errors 為零', !hasPageErrors(pageErrors))

      const consoleOutput = runAgent(session, ['console', '--json'])
      check(failures, 'console 沒有 error 訊息', consoleErrorEntries(consoleOutput).length === 0)
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'agent-browser 驗收失敗')
      console.log('FAIL  agent-browser 頁面驗收失敗')
    }
  } finally {
    if (browserStarted) closeAgent(session)
  }

  if (failures.length > 0) {
    console.error(`\n部署驗收失敗：${failures.length} 項`)
    for (const failure of failures) console.error(`- ${failure}`)
    process.exitCode = 1
    return
  }

  console.log('\n部署驗收全部通過')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : '部署驗收失敗')
  process.exitCode = 1
})
