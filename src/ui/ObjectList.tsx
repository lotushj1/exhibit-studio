import { Flex, Text } from '@radix-ui/themes'
import { useSceneStore } from '../store/sceneStore'
import { ObjectListRow } from './ObjectListRow'

export function ObjectList() {
  const objects = useSceneStore((s) => s.objects)
  const selectedId = useSceneStore((s) => s.selectedId)

  if (objects.length === 0) {
    return (
      <Flex p="3">
        <Text size="1" color="gray">場景是空的，從物件庫加入第一個展櫃</Text>
      </Flex>
    )
  }

  return (
    <Flex direction="column" gap="1" p="2">
      {objects.map((o) => (
        <ObjectListRow key={o.id} object={o} selected={o.id === selectedId} />
      ))}
    </Flex>
  )
}
