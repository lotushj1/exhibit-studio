import { useState } from 'react'
import { Button, Callout, DropdownMenu, Flex, SegmentedControl, Switch, Text, TextField } from '@radix-ui/themes'
import { useSceneStore } from '../store/sceneStore'
import { useHighQualityGlass } from '../materials/useHighQualityGlass'
import { useAppearanceStore } from '../store/appearanceStore'
import { CAMERA_ORDER, CAMERA_PRESETS } from '../scene/cameraPresets'
import { getCaptureButtonLabel, useScreenshotStore } from '../scene/useScreenshot'
import { ProjectMenu } from './ProjectMenu'
import type { CameraPresetId, DimensionMode, ProjectionMode } from '../store/sceneStore'

export function TopBar() {
  const projectName = useSceneStore((s) => s.projectName)
  const setProjectName = useSceneStore((s) => s.setProjectName)
  const cameraPreset = useSceneStore((s) => s.cameraPreset)
  const setCameraPreset = useSceneStore((s) => s.setCameraPreset)
  const projection = useSceneStore((s) => s.projection)
  const setProjection = useSceneStore((s) => s.setProjection)
  const hqGlass = useHighQualityGlass((s) => s.enabled)
  const setHqGlass = useHighQualityGlass((s) => s.setEnabled)
  const appearance = useAppearanceStore((s) => s.appearance)
  const setAppearance = useAppearanceStore((s) => s.setAppearance)
  const dimensionMode = useSceneStore((s) => s.dimensionMode)
  const setDimensionMode = useSceneStore((s) => s.setDimensionMode)
  const capture = useScreenshotStore((s) => s.capture)
  const capturing = useScreenshotStore((s) => s.capturing)
  /**
   * 跟 `TextureUpload.tsx` 的上傳失敗處理走同一套模式（Task 22 review
   * Finding 2 的 Minor 2）：`capture()` 現在會在失敗時 throw（見
   * `useScreenshot.ts`），這裡射後不理的 `void capture?.(scale)` 原本
   * 會讓失敗變成沒人處理的 unhandled promise rejection、使用者完全看不到
   * 任何回饋。用一個本地的 `handleCapture` 包一層 try/catch，失敗時用
   * 跟 `TextureUpload` 一樣的 `Callout.Root size="1" color="gray"` 顯示
   * 提示。
   */
  const [captureError, setCaptureError] = useState<string | null>(null)

  const handleCapture = async (scale: 1 | 2) => {
    setCaptureError(null)
    try {
      await capture?.(scale)
    } catch {
      setCaptureError('截圖失敗，請再試一次')
    }
  }

  return (
    <Flex align="center" gap="4" px="3" py="2" wrap="wrap" style={{ borderBottom: '1px solid var(--gray-6)' }}>
      <TextField.Root
        size="1"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        style={{ width: 200 }}
      />
      <SegmentedControl.Root
        size="1"
        value={cameraPreset}
        onValueChange={(v) => setCameraPreset(v as CameraPresetId)}
      >
        {CAMERA_ORDER.map((id) => {
          /**
           * Review Finding 1（2026-08-01 補做）：正交模式下「人眼視角」
           * 退化成跟「側視」完全相同的位置與注視點（見 `cameraPresets.ts`
           * 的 `resolvePreset`），但退化前的實作只顯示原始 label，使用者
           * 切到正交模式後點「人眼視角」畫面卻長得跟「側視」一樣，介面上
           * 沒有任何線索。這裡在正交模式下把該格標籤加上限定詞，讓使用者
           * 按下去之前就知道會發生什麼事，不用等畫面切換完才發現重複。
           */
          const degraded = projection === 'orthographic' && id === 'eye'
          const label = degraded ? `${CAMERA_PRESETS[id].label}（＝側視）` : CAMERA_PRESETS[id].label
          return (
            <SegmentedControl.Item key={id} value={id}>
              {label}
            </SegmentedControl.Item>
          )
        })}
      </SegmentedControl.Root>
      <SegmentedControl.Root
        size="1"
        value={projection}
        onValueChange={(v) => setProjection(v as ProjectionMode)}
      >
        <SegmentedControl.Item value="perspective">透視</SegmentedControl.Item>
        <SegmentedControl.Item value="orthographic">正交</SegmentedControl.Item>
      </SegmentedControl.Root>
      <Flex align="center" gap="2">
        <Text size="1" color="gray">尺寸標註</Text>
        <SegmentedControl.Root
          size="1"
          value={dimensionMode}
          onValueChange={(v) => setDimensionMode(v as DimensionMode)}
        >
          <SegmentedControl.Item value="off">關閉</SegmentedControl.Item>
          <SegmentedControl.Item value="selected">選取物件</SegmentedControl.Item>
          <SegmentedControl.Item value="all">全部物件</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Flex>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button size="1" variant="soft" disabled={capturing} aria-busy={capturing} aria-live="polite">
            {getCaptureButtonLabel(capturing)}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item disabled={capturing} onSelect={() => void handleCapture(1)}>目前解析度</DropdownMenu.Item>
          <DropdownMenu.Item disabled={capturing} onSelect={() => void handleCapture(2)}>兩倍解析度</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      {captureError && (
        <Callout.Root size="1" color="gray">
          <Callout.Text>{captureError}</Callout.Text>
        </Callout.Root>
      )}
      <ProjectMenu />
      <Flex align="center" gap="4" ml="auto">
        <Flex align="center" gap="2">
          <Text size="1" color="gray">高品質玻璃</Text>
          <Switch size="1" checked={hqGlass} onCheckedChange={setHqGlass} />
        </Flex>
        <SegmentedControl.Root
          size="1"
          value={appearance}
          onValueChange={(v) => setAppearance(v as 'dark' | 'light')}
        >
          <SegmentedControl.Item value="dark">深色</SegmentedControl.Item>
          <SegmentedControl.Item value="light">淺色</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Flex>
    </Flex>
  )
}
