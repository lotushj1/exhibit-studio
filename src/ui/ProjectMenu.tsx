import { useRef, useState } from 'react'
import { Button, Callout, DropdownMenu, Flex } from '@radix-ui/themes'
import { exportProject, importProject } from '../store/projectFile'

export function ProjectMenu() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <Flex align="center" gap="2">
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setError(await importProject(file))
        }}
      />

      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button size="1" variant="soft">專案檔</Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item onSelect={() => void exportProject()}>匯出</DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => inputRef.current?.click()}>匯入</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      {error && (
        <Callout.Root size="1" color="gray">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}
    </Flex>
  )
}
