import { Callout } from '@radix-ui/themes'
import { useTextureStore } from '../materials/textureStore'

/** IndexedDB 不可用時常駐提示，例如無痕模式。 */
export function StorageWarning() {
  const available = useTextureStore((s) => s.storageAvailable)
  if (available) return null
  return (
    <Callout.Root size="1" color="gray" style={{ borderRadius: 0 }}>
      <Callout.Text>此瀏覽器無法自動存檔，關閉分頁後這次的內容會消失</Callout.Text>
    </Callout.Root>
  )
}
