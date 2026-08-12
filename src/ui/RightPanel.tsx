import { Box, Flex, ScrollArea, Tabs, Text } from '@radix-ui/themes'
import { useSceneStore } from '../store/sceneStore'
import { getDef, isParamVisible } from '../objects/registry'
import { ParamField } from './ParamField'
import { TransformFields } from './TransformFields'
import { SurfaceEditor } from './SurfaceEditor'

export function RightPanel() {
  const selectedId = useSceneStore((s) => s.selectedId)

  if (!selectedId) {
    return (
      <Flex p="3">
        <Text size="1" color="gray">選取一個物件來調整它的尺寸與外觀</Text>
      </Flex>
    )
  }

  return (
    <Tabs.Root defaultValue="size" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Tabs.List size="1">
        <Tabs.Trigger value="size">尺寸</Tabs.Trigger>
        <Tabs.Trigger value="look">外觀</Tabs.Trigger>
      </Tabs.List>
      <Box style={{ flex: 1, minHeight: 0 }}>
        <ScrollArea type="auto" style={{ height: '100%' }}>
          <Tabs.Content value="size"><SizeTab objectId={selectedId} /></Tabs.Content>
          <Tabs.Content value="look">
            <SizeSummary objectId={selectedId} />
            <SurfaceEditor objectId={selectedId} />
          </Tabs.Content>
        </ScrollArea>
      </Box>
    </Tabs.Root>
  )
}

/**
 * 外觀分頁最上方的尺寸摘要：調材質貼圖時不用切回尺寸分頁也看得到目前尺寸。
 *
 * 跟 `SizeTab` 一樣走 schema，只挑單位是公分的數值參數，並且尊重
 * `visibleWhen`（例如踢腳高度為 0 時不顯示踢腳內縮），所以顯示的內容跟
 * 尺寸分頁當下實際看得到的欄位一致。新增物件種類不必回來改這裡。
 * 唯讀，要改還是去尺寸分頁，避免同一個值有兩個編輯入口。
 */
function SizeSummary({ objectId }: { objectId: string }) {
  const object = useSceneStore((s) => s.objects.find((o) => o.id === objectId))
  if (!object) return null
  const def = getDef(object.kind)

  const sizes = def.schema.filter(
    (p) =>
      p.type === 'number' &&
      p.unit === 'cm' &&
      isParamVisible(def, p.key, object.params) &&
      typeof object.params[p.key] === 'number',
  )
  if (sizes.length === 0) return null

  return (
    <Flex wrap="wrap" gap="2" px="3" pt="3">
      {sizes.map((p) => (
        <Text key={p.key} size="1" color="gray">
          {p.label} {object.params[p.key] as number} cm
        </Text>
      ))}
    </Flex>
  )
}

/** 尺寸分頁：讀物件的 schema 自動生成參數欄位，新增物件不必碰這個檔案。 */
function SizeTab({ objectId }: { objectId: string }) {
  const object = useSceneStore((s) => s.objects.find((o) => o.id === objectId))
  if (!object) return null
  const def = getDef(object.kind)

  return (
    <Flex direction="column" gap="3" p="3">
      {def.schema
        .filter((p) => isParamVisible(def, p.key, object.params))
        .map((p) => (
          <ParamField key={p.key} objectId={objectId} param={p} value={object.params[p.key]} />
        ))}
      <TransformFields objectId={objectId} />
    </Flex>
  )
}
