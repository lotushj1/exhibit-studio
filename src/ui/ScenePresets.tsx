import { useState } from 'react'
import { AlertDialog, Button, Card, Flex, Heading, Text } from '@radix-ui/themes'
import {
  PRESET_METADATA,
  createPresetScene,
  needsPresetReplacementConfirmation,
  presetAppliedMessage,
  type PresetId,
} from '../presets'
import { useSceneStore } from '../store/sceneStore'

function objectSummary(preset: (typeof PRESET_METADATA)[number]): string {
  return preset.objects.map((object) => `${object.count} ${object.label}`).join(' · ')
}

export function ScenePresets() {
  const objectCount = useSceneStore((state) => state.objects.length)
  const replaceScene = useSceneStore((state) => state.replaceScene)
  const [pendingId, setPendingId] = useState<PresetId | null>(null)
  const [status, setStatus] = useState('')

  const applyPreset = (id: PresetId) => {
    if (needsPresetReplacementConfirmation(objectCount)) {
      setPendingId(id)
      return
    }
    commitPreset(id)
  }

  const commitPreset = (id: PresetId) => {
    const scene = createPresetScene(id)
    const metadata = PRESET_METADATA.find((preset) => preset.id === id)
    if (!scene || !metadata) return
    replaceScene(scene.objects, scene.projectName)
    setPendingId(null)
    setStatus(presetAppliedMessage(metadata.title, scene.objects.length))
  }

  return (
    <Flex direction="column" gap="2" p="2" style={{ minWidth: 0 }}>
      <Text size="1" color="gray" style={{ lineHeight: 1.4 }}>
        選一個常見配置，快速開始設計。
      </Text>
      {PRESET_METADATA.map((preset) => (
        <Card key={preset.id} size="1" style={{ minWidth: 0 }}>
          <Flex direction="column" gap="2" style={{ minWidth: 0 }}>
            <Heading as="h3" size="3" style={{ overflowWrap: 'anywhere', margin: 0 }}>
              {preset.title}
            </Heading>
            <Text size="1" color="gray" style={{ lineHeight: 1.4, overflowWrap: 'anywhere' }}>
              {preset.description}
            </Text>
            <Text size="1" style={{ lineHeight: 1.4, overflowWrap: 'anywhere' }}>
              {objectSummary(preset)}
            </Text>
            <Button
              size="1"
              variant="soft"
              aria-label={`套用「${preset.title}」範本`}
              style={{ width: '100%', whiteSpace: 'normal', height: 'auto', minHeight: 32 }}
              onClick={() => applyPreset(preset.id)}
            >
              套用範本
            </Button>
          </Flex>
        </Card>
      ))}

      <div role="status" aria-live="polite" aria-atomic="true" className="scene-presets__status">
        {status}
      </div>

      <AlertDialog.Root
        open={pendingId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingId(null)
        }}
      >
        <AlertDialog.Content maxWidth="360px">
          <AlertDialog.Title>取代目前場景？</AlertDialog.Title>
          <AlertDialog.Description size="2">
            目前場景有 {objectCount} 個物件。套用範本會取代目前場景，並清除選取與復原／重做歷史。
          </AlertDialog.Description>
          <Flex gap="3" justify="end" mt="4">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">取消</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button onClick={() => pendingId && commitPreset(pendingId)}>套用範本</Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Flex>
  )
}
