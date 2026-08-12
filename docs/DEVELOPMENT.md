# 開發文件

這份文件補充維護者與貢獻者需要的技術資訊；使用者操作請先看 [README](../README.md)。

## 專案結構

- `src/objects/`：物件定義、參數 schema、可上材質的 surfaces 與 R3F Render 元件。
- `src/scene/`：Viewport、同一個 Canvas 內的透視／正交相機交換、CameraRig、尺寸標註與截圖。
- `src/store/sceneStore.ts`：場景內容、undo／redo 歷史與檢視偏好。
- `src/store/persistence.ts`：localStorage 自動儲存、存檔對帳與貼圖資產清理。
- `src/store/projectFile.ts`：單檔 JSON 專案匯出／匯入與內嵌貼圖。
- `src/materials/textureStore.ts`：IndexedDB 貼圖資產與 GPU texture cache。

## 物件與 schema

新增物件時，在 `src/objects/` 匯出 `ObjectDef`，再於 `src/objects/registry.ts` 註冊：

- `schema` 宣告參數、型別、預設值、min／max 與可選的 `sideEffect`。
- `surfaces` 宣告可套用材質與貼圖的面。
- `Render` 是實際繪製幾何的 React Three Fiber 元件。

屬性面板、物件庫、拖曳、存檔與匯入會依 registry 自動使用這些定義。修改 schema 時，請同步補單元測試與舊存檔對帳案例。

## 相機與投影

`Viewport` 永遠只建立一個 `<Canvas>`。`ProjectionCamera` 在 Canvas 內保留一組 `PerspectiveCamera` 與 `OrthographicCamera`，切換時更新 R3F `state.camera` 與 `raycaster.camera`，因此不會重建 WebGL context。相機姿態會帶到新相機，`CameraRig` 再以目前預設補間位置、注視點與 fov／zoom。

不要用 `key={projection}` 讓 Canvas 重掛；這會丟失 renderer、OrbitControls 與 GPU 資源。

## 儲存與復原

- 場景自動儲存在 `localStorage`；貼圖 blob 與解碼後的 texture cache 在 IndexedDB／記憶體。
- `past` 與 `future` 快照保存物件內容。貼圖資產只有在目前場景、past、future 都沒有參照時才可清理。
- `startAutoSave` 以 400ms 節流寫入。清理只掃描場景變更前已存在的資產，新上傳／匯入的資產會先跳過一次，避免尚未附加到 surface 就被刪除。
- `clearScene` 與 `replaceScene` 會清空 undo／redo；之後若沒有任何場景參照，貼圖才會進入清理候選。
- 專案匯入先寫入貼圖，再替換場景；同 id 的既有資產不覆寫。

## 測試與驗證

提交前至少執行：

```bash
npm test
npx tsc --noEmit
npm run build
git diff --check
```

修改相機、材質或互動時，請補上純函式／store 回歸測試，並在本機瀏覽器實際操作。部署驗證腳本位於 `scripts/verify-deployment.mjs`，需要目標網址與可用的 WebGL 瀏覽器環境。

## 部署驗證

```bash
npm run verify:deployment -- https://exhibit-studio.vercel.app
```

腳本會讀回頁面與資源狀態，並檢查單一 Canvas、WebGL context、WebGLGate、Vite overlay、page errors 與 console errors。Preview 若受 SSO 保護，請使用具備權限的驗證方式；不要把 token 或使用者資料寫入輸出。
