import { useEffect } from 'react'
import { Flex } from '@radix-ui/themes'
import { TopBar } from './ui/TopBar'
import { LeftPanel } from './ui/LeftPanel'
import { RightPanel } from './ui/RightPanel'
import { StorageWarning } from './ui/StorageWarning'
import { useKeyboard } from './ui/useKeyboard'
import { Viewport } from './scene/Viewport'
import { WebGLGate } from './scene/WebGLGate'
import {
  loadSavedScene,
  pruneLoadedTextureAssetsAfterLoad,
  startAutoSave,
} from './store/persistence'
import { texturesReady } from './store/bootstrap'
import { useTextureStore } from './materials/textureStore'

export default function App() {
  useKeyboard()

  useEffect(() => {
    const restored = loadSavedScene()
    const stopAutoSave = startAutoSave(texturesReady)
    let disposed = false
    void texturesReady.then((loadedAssetIds) => {
      if (disposed) return
      pruneLoadedTextureAssetsAfterLoad(
        restored,
        useTextureStore.getState().storageAvailable,
        loadedAssetIds,
      )
    })
    return () => {
      disposed = true
      stopAutoSave()
    }
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
