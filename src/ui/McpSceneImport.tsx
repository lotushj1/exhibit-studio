import { useCallback, useEffect, useState } from 'react'
import { AlertDialog, Button, Callout, Flex, Text } from '@radix-ui/themes'
import { decodeMcpProject, type McpProjectPayload } from '../store/mcpSceneLink'
import { useSceneStore } from '../store/sceneStore'

function clearMcpHash() {
  if (!window.location.hash.includes('#mcp=')) return
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
}

/**
 * Handles the local-first MCP handoff. Parsing only prepares a confirmation
 * dialog; it never mutates the scene. The app's normal saved-scene restore runs
 * first in App.tsx, so accepting this dialog is the explicit replacement gate.
 */
export function McpSceneImport() {
  const replaceScene = useSceneStore((state) => state.replaceScene)
  const [pending, setPending] = useState<McpProjectPayload | null>(null)
  const [error, setError] = useState('')

  const inspectHash = useCallback(() => {
    const result = decodeMcpProject(window.location.hash)
    if ('ignored' in result) {
      setPending(null)
      setError('')
      return
    }
    if ('error' in result) {
      setPending(null)
      setError(result.error)
      clearMcpHash()
      return
    }
    setError('')
    setPending(result.project)
  }, [])

  useEffect(() => {
    inspectHash()
    window.addEventListener('hashchange', inspectHash)
    return () => window.removeEventListener('hashchange', inspectHash)
  }, [inspectHash])

  const cancel = () => {
    setPending(null)
    clearMcpHash()
  }

  const confirm = () => {
    if (!pending) return
    replaceScene(pending.objects, pending.projectName)
    setPending(null)
    clearMcpHash()
  }

  return (
    <>
      {error && (
        <Callout.Root color="red" role="status" aria-live="polite" aria-atomic="true" size="1">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      <AlertDialog.Root open={pending !== null} onOpenChange={(open) => { if (!open) cancel() }}>
        <AlertDialog.Content maxWidth="380px">
          <AlertDialog.Title>匯入 MCP 場景？</AlertDialog.Title>
          <AlertDialog.Description size="2">
            <Flex direction="column" gap="2">
              <Text>場景名稱：{pending?.projectName}</Text>
              <Text>物件數：{pending?.objects.length ?? 0}</Text>
              <Text>確認後會取代目前場景，並清除 undo-redo 歷史。這個動作只會在你確認後執行。</Text>
            </Flex>
          </AlertDialog.Description>
          <Flex gap="3" justify="end" mt="4">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray" onClick={cancel}>取消</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button onClick={confirm}>確認匯入</Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  )
}
