import { Flex, Select, Separator, Text } from '@radix-ui/themes'
import { useSceneStore } from '../store/sceneStore'
import { getDef } from '../objects/registry'
import { FINISHES, FINISH_ORDER, type FinishId } from '../materials/finishes'
import { TextureUpload } from './TextureUpload'

export function SurfaceEditor({ objectId }: { objectId: string }) {
  const object = useSceneStore((s) => s.objects.find((o) => o.id === objectId))
  const setSurface = useSceneStore((s) => s.setSurface)
  if (!object) return null
  const def = getDef(object.kind)

  return (
    <Flex direction="column" gap="4" p="3">
      {def.surfaces.map((surfaceDef, index) => {
        const spec = object.surfaces[surfaceDef.id]
        if (!spec) return null
        return (
          <Flex key={surfaceDef.id} direction="column" gap="2">
            {index > 0 && <Separator size="4" mb="2" />}
            <Text size="2" weight="medium">{surfaceDef.label}</Text>

            <Flex gap="2" align="center">
              <Select.Root
                size="1"
                value={spec.finish}
                onValueChange={(v) => {
                  const finish = v as FinishId
                  setSurface(objectId, surfaceDef.id, {
                    finish,
                    color: FINISHES[finish].suggestedColor,
                  })
                }}
              >
                <Select.Trigger style={{ flex: 1 }} />
                <Select.Content>
                  {FINISH_ORDER.map((id) => (
                    <Select.Item key={id} value={id}>{FINISHES[id].label}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>

              <input
                type="color"
                value={spec.color}
                onChange={(e) => setSurface(objectId, surfaceDef.id, { color: e.target.value })}
                style={{
                  width: 32, height: 28, padding: 0, border: '1px solid var(--gray-7)',
                  borderRadius: 'var(--radius-2)', background: 'none', cursor: 'pointer',
                }}
              />
            </Flex>

            <TextureUpload objectId={objectId} surfaceId={surfaceDef.id} />
          </Flex>
        )
      })}
    </Flex>
  )
}
