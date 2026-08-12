import { Box, ScrollArea, Tabs } from '@radix-ui/themes'
import { ObjectLibrary } from './ObjectLibrary'
import { ObjectList } from './ObjectList'
import { ScenePresets } from './ScenePresets'

export function LeftPanel() {
  return (
    <Tabs.Root defaultValue="library" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Tabs.List size="1">
        <Tabs.Trigger value="library">物件庫</Tabs.Trigger>
        <Tabs.Trigger value="presets">範本</Tabs.Trigger>
        <Tabs.Trigger value="scene">場景清單</Tabs.Trigger>
      </Tabs.List>
      <Box style={{ flex: 1, minHeight: 0 }}>
        <ScrollArea type="auto" style={{ height: '100%' }}>
          <Tabs.Content value="library"><ObjectLibrary /></Tabs.Content>
          <Tabs.Content value="presets"><ScenePresets /></Tabs.Content>
          <Tabs.Content value="scene"><ObjectList /></Tabs.Content>
        </ScrollArea>
      </Box>
    </Tabs.Root>
  )
}
