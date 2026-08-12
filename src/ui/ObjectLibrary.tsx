import { Button, Flex, Text } from '@radix-ui/themes'
import { listDefs } from '../objects/registry'
import { useSceneStore } from '../store/sceneStore'
import type { ObjectDef } from '../objects/types'

const GROUPS: { category: ObjectDef['category']; title: string }[] = [
  { category: 'case', title: '展櫃' },
  { category: 'figure', title: '假人' },
  { category: 'prop', title: '道具' },
]

export function ObjectLibrary() {
  const addObject = useSceneStore((s) => s.addObject)

  return (
    <Flex direction="column" gap="4" p="3">
      {GROUPS.map((group) => {
        const defs = listDefs(group.category)
        if (defs.length === 0) return null
        return (
          <Flex key={group.category} direction="column" gap="2">
            <Text size="1" color="gray" weight="medium">{group.title}</Text>
            <Flex direction="column" gap="1">
              {defs.map((def) => (
                <Button
                  key={def.kind}
                  size="2"
                  variant="soft"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => addObject(def.kind)}
                >
                  {def.label}
                </Button>
              ))}
            </Flex>
          </Flex>
        )
      })}
    </Flex>
  )
}
