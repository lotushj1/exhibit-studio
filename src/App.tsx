import { useEffect } from 'react'
import { Flex } from '@radix-ui/themes'
import { TopBar } from './ui/TopBar'
import { LeftPanel } from './ui/LeftPanel'
import { RightPanel } from './ui/RightPanel'
import { StorageWarning } from './ui/StorageWarning'
import { useKeyboard } from './ui/useKeyboard'
import { Viewport } from './scene/Viewport'
import { WebGLGate } from './scene/WebGLGate'
import { loadSavedScene, startAutoSave, pruneOrphanedTextureAssets, shouldPruneAfterLoad } from './store/persistence'
import { texturesReady } from './store/bootstrap'
import { useTextureStore } from './materials/textureStore'

export default function App() {
  useKeyboard()

  useEffect(() => {
    const restored = loadSavedScene()
    // 貼圖孤兒清理（Finding 5）必須等場景載入（上面這行，同步）與貼圖載入
    // （`texturesReady`，非同步）都完成才能跑，順序反過來的話所有資產都會
    // 被誤判成孤兒。只在開機跑這一次，不在編輯過程中重複掃描。
    //
    // Residual 1：`shouldPruneAfterLoad` 決定要不要跑——場景沒有從存檔
    // 真的還原成功（存檔壞掉、`version` 不符、沒有存檔、`localStorage`
    // 拋例外）時絕對不能跑，否則會把 IndexedDB 裡所有貼圖資產當孤兒清光，
    // 造成不可逆的資料遺失。
    if (shouldPruneAfterLoad(restored, useTextureStore.getState().storageAvailable)) {
      void texturesReady.then(() => pruneOrphanedTextureAssets())
    }
    return startAutoSave()
  }, [])

  return (
    <Flex direction="column" style={{ height: '100vh' }}>
      <TopBar />
      <StorageWarning />
      <Flex style={{ flex: 1, minHeight: 0 }}>
        <aside style={{ width: 220, borderRight: '1px solid var(--gray-6)', minHeight: 0 }}>
          <LeftPanel />
        </aside>
        <main style={{ flex: 1, minWidth: 0 }}>
          <WebGLGate><Viewport /></WebGLGate>
        </main>
        <aside style={{ width: 280, borderLeft: '1px solid var(--gray-6)', minHeight: 0 }}>
          <RightPanel />
        </aside>
      </Flex>
    </Flex>
  )
}
