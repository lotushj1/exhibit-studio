import { useRef, useState } from 'react'
import { Button, Callout, Flex, SegmentedControl, Select, Slider, Text } from '@radix-ui/themes'
import { useSceneStore } from '../store/sceneStore'
import { useTextureStore, validateUpload } from '../materials/textureStore'
import type { FitMode, Rotation } from '../materials/textureFit'

const FIT_OPTIONS: { value: FitMode; label: string }[] = [
  { value: 'cover', label: '填滿（裁切）' },
  { value: 'contain', label: '完整顯示（留白）' },
  { value: 'repeat', label: '平鋪' },
]

export function TextureUpload({ objectId, surfaceId }: { objectId: string; surfaceId: string }) {
  const surface = useSceneStore((s) => s.objects.find((o) => o.id === objectId)?.surfaces[surfaceId])
  const setSurface = useSceneStore((s) => s.setSurface)
  const addFromFile = useTextureStore((s) => s.addFromFile)
  const assets = useTextureStore((s) => s.assets)
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  if (!surface) return null
  const texture = surface.texture

  const handleFile = async (file: File) => {
    const check = validateUpload(file)
    if (!check.ok) {
      setError(check.reason)
      return
    }
    setError(null)
    try {
      const assetId = await addFromFile(file)
      setSurface(objectId, surfaceId, {
        texture: { assetId, fit: 'cover', offset: [0, 0], scale: 1, rotation: 0, unlit: false },
      })
    } catch {
      setError('讀取這張圖片失敗，換一張試試')
    }
  }

  const patchTexture = (patch: Partial<NonNullable<typeof texture>>) => {
    if (!texture) return
    setSurface(objectId, surfaceId, { texture: { ...texture, ...patch } })
  }

  /**
   * 滑桿拖曳中的即時路徑：不進復原歷史，畫面即時跟著動。
   * 放開滑桿時（`onValueCommit`）改呼叫上面的 `patchTexture`（不帶 live），
   * 兩者共用 `sceneStore` 裡同一個 `surface.<surfaceId>` 手勢 key，
   * 整段拖曳只會推入一筆復原歷史，undo 一次就退回拖曳前的狀態
   * （機制見 `sceneStore.ts` 的 `setSurface`/`patchObjectLive`/`liveSnapshot`）。
   */
  const patchTextureLive = (patch: Partial<NonNullable<typeof texture>>) => {
    if (!texture) return
    setSurface(objectId, surfaceId, { texture: { ...texture, ...patch } }, { live: true })
  }

  return (
    <Flex direction="column" gap="2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ''
        }}
      />

      <Flex gap="2">
        <Button size="1" variant="soft" onClick={() => inputRef.current?.click()} style={{ flex: 1 }}>
          {texture ? '更換圖片' : '上傳圖片'}
        </Button>
        {texture && (
          <Button
            size="1"
            variant="soft"
            color="gray"
            onClick={() => setSurface(objectId, surfaceId, { texture: undefined })}
          >
            移除
          </Button>
        )}
      </Flex>

      {error && (
        <Callout.Root size="1" color="gray">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      {texture && (
        <>
          <Text size="1" color="gray">{assets[texture.assetId]?.name ?? '圖片'}</Text>

          <Select.Root size="1" value={texture.fit} onValueChange={(v) => patchTexture({ fit: v as FitMode })}>
            <Select.Trigger />
            <Select.Content>
              {FIT_OPTIONS.map((o) => (
                <Select.Item key={o.value} value={o.value}>{o.label}</Select.Item>
              ))}
            </Select.Content>
          </Select.Root>

          {texture.fit === 'repeat' && (
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">平鋪大小</Text>
              <Slider
                size="1"
                value={[texture.scale]}
                min={0.05}
                max={3}
                step={0.05}
                onValueChange={([v]) => patchTextureLive({ scale: v })}
                onValueCommit={([v]) => patchTexture({ scale: v })}
              />
            </Flex>
          )}

          <Flex direction="column" gap="1">
            <Text size="1" color="gray">水平位移</Text>
            <Slider
              size="1"
              value={[texture.offset[0]]}
              min={-1}
              max={1}
              step={0.01}
              onValueChange={([v]) => patchTextureLive({ offset: [v, texture.offset[1]] })}
              onValueCommit={([v]) => patchTexture({ offset: [v, texture.offset[1]] })}
            />
            <Text size="1" color="gray">垂直位移</Text>
            <Slider
              size="1"
              value={[texture.offset[1]]}
              min={-1}
              max={1}
              step={0.01}
              onValueChange={([v]) => patchTextureLive({ offset: [texture.offset[0], v] })}
              onValueCommit={([v]) => patchTexture({ offset: [texture.offset[0], v] })}
            />
          </Flex>

          {/* 兩個狀態都寫出名字，不要用一個只標了開啟狀態的開關——關掉時
              使用者得自己猜「沒有原色顯示」是什麼意思。 */}
          <Flex direction="column" gap="1">
            <Text size="1" color="gray">顯示方式</Text>
            <SegmentedControl.Root
              size="1"
              value={texture.unlit ? 'unlit' : 'lit'}
              onValueChange={(v) => patchTexture({ unlit: v === 'unlit' })}
            >
              <SegmentedControl.Item value="lit">受光顯示</SegmentedControl.Item>
              <SegmentedControl.Item value="unlit">原色顯示</SegmentedControl.Item>
            </SegmentedControl.Root>
          </Flex>

          <Button
            size="1"
            variant="soft"
            color="gray"
            onClick={() => patchTexture({ rotation: (((texture.rotation + 90) % 360) as Rotation) })}
          >
            旋轉 90 度（目前 {texture.rotation}°）
          </Button>
        </>
      )}
    </Flex>
  )
}
