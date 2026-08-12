import React from 'react'
import ReactDOM from 'react-dom/client'
import { Theme } from '@radix-ui/themes'
import '@radix-ui/themes/styles.css'
import './index.css'
import App from './App'
import { useAppearanceStore } from './store/appearanceStore'
// 觸發啟動時載入貼圖（見 store/bootstrap.ts 的模組層級呼叫說明）。
// `App.tsx` 也會 import 這個模組來等待載入完成，兩邊拿到同一個 Promise。
import './store/bootstrap'

/**
 * `accentColor="gray"`、`grayColor="slate"`、`radius="small"` 是固定不變的
 * 硬規則，不隨外觀偏好調整；只有 `appearance` 讀 `useAppearanceStore`
 * （深色／淺色切換，見 `TopBar.tsx` 與 `store/appearanceStore.ts`）。
 */
function ThemedApp() {
  const appearance = useAppearanceStore((s) => s.appearance)
  return (
    <Theme accentColor="gray" grayColor="slate" radius="small" appearance={appearance}>
      <App />
    </Theme>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemedApp />
  </React.StrictMode>,
)
