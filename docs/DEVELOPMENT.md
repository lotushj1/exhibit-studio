# 開發文件

這份文件補充維護者與貢獻者需要的技術資訊；使用者操作請先看 [README](../README.md)。

## 專案結構

- `src/objects/`：物件定義、參數 schema、可上材質的 surfaces 與 R3F Render 元件。
- `src/scene/`：Viewport、同一個 Canvas 內的透視／正交相機交換、CameraRig、尺寸標註與截圖。
- `src/store/sceneStore.ts`：場景內容、undo／redo 歷史與檢視偏好。
- `src/store/persistence.ts`：localStorage 自動儲存、存檔對帳與貼圖資產清理。
- `src/store/projectFile.ts`：單檔 JSON 專案匯出／匯入與內嵌貼圖。
- `src/materials/textureStore.ts`：IndexedDB 貼圖資產與 GPU texture cache。
- `src/presets/`：不含貼圖的常見場景範本 metadata、builder、佈局邊界 helper 與單元測試。
- `mcp-server/server.ts`：MCP stdio factory 與 8 個 local-first 場景工具；`mcp-server/tsconfig.json`
  是獨立 Node typecheck 邊界。
- `src/store/mcpSceneLink.ts`：MCP v1 UTF-8 base64url 深連結編解碼與 project-file 對帳。
- `src/ui/McpSceneImport.tsx`：App 端 MCP deep-link confirmation gate。

## 新增場景範本

新增範本時，先在 `src/presets/index.ts` 補上 immutable metadata，再以現有
`createObject(kind)` 建立每一個物件。builder 只覆蓋 registry 已宣告的參數與
surface，讓完整 defaults、合法材質與未來 schema 變更仍由物件 registry 管理；不要
手動拼出物件 id、params 或貼圖資料。位置要保持在地面上、彼此不穿入，若物件放在
櫃面上則讓上下邊界相接而非重疊。

每個範本至少測試 metadata、物件種類／數量、參數範圍、surface key、有限 transform、
唯一且可重建的 id，以及 `footprintOverlap`。同一範本連續建立時，測試物件與巢狀資料
皆為獨立參考；未知 id 應安全回傳 `null`。純 UI 決策（例如是否需要取代確認與成功
文案）也放在同一組 Node 可執行的單元測試，避免為此引入 jsdom。

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
npm run typecheck:mcp
npm run verify:mcp
npm run build
git diff --check
```

修改相機、材質或互動時，請補上純函式／store 回歸測試，並在本機瀏覽器實際操作。部署驗證腳本位於 `scripts/verify-deployment.mjs`，需要目標網址與可用的 WebGL 瀏覽器環境。

## 部署驗證

```bash
npm run verify:deployment -- https://exhibit-studio.vercel.app
```

腳本會讀回頁面與資源狀態，並檢查單一 Canvas、WebGL context、WebGLGate、Vite overlay、page errors 與 console errors。Preview 若受 SSO 保護，請使用具備權限的驗證方式；不要把 token 或使用者資料寫入輸出。
