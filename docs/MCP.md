# Exhibit Studio MCP

這是 local-first、stdio-only 的 MCP server。它不連線後端，也不直接寫瀏覽器的
localStorage；每次 stdio connection 都有自己的場景 state。MCP host 必須由使用者在
本機啟動 `mcp-server/server.ts`，建議透過 `node --import tsx/esm` 或 `npm run
verify:mcp` 的同樣方式啟動。

## Host 設定

最穩定的 host-independent 設定是不依賴 host 的 `cwd`，而是把 repo 絕對路徑交給
`npm --prefix`。以下 JSON 可直接作為 Claude Desktop 或其他支援 `mcpServers` 的 host
設定：

```json
{
  "mcpServers": {
    "exhibit-studio": {
      "command": "npm",
      "args": ["--prefix", "/absolute/path/to/exhibit-studio", "run", "mcp"]
    }
  }
}
```

若 host 只接受單一 command/args，使用同一組值：`command: "npm"`、
`args: ["--prefix", "/absolute/path/to/exhibit-studio", "run", "mcp"]`。直接啟動時也可
在 repo 內執行 `npm run mcp`；這個 script 會以 Node 20 的 `tsx` 啟動 stdio server。

Codex CLI 的本機語法支援 stdio command separator，可由任意工作目錄執行：

```bash
codex mcp add exhibit-studio -- npm --prefix /absolute/path/to/exhibit-studio run mcp
```

若要切換正式站的深連結 base URL，設定 server process 的
`EXHIBIT_STUDIO_URL=https://example.com`。這是 host／環境設定，不是 tool argument；
server 不接受任意外部 URL。未設定時使用 `https://exhibit-studio.vercel.app/`。

## 工具

- `list_components`：唯讀列出 registry 的 10 種物件、參數型別／min／max／default／options
  與 surfaces。
- `new_scene`：清空 connection 內的場景並設定 `projectName`。
- `apply_preset`：套用 `brand-wall`、`glass-cabinet`、`retail-display`、`small-meeting`。
  未知 id 以 `isError` 回覆且不改 state。
- `add_object`：以 registry schema 驗證 `kind`、`params`、`surfaceColors`，位置接受 cm、
  旋轉接受 deg。未知欄位／參數／材質面會明確失敗；最多 50 個物件。
- `update_object`：依 id 原子更新名稱、位置、旋轉、參數、材質色、visible、locked。
- `remove_object`：依 id 移除；未知 id 是 no-op 並以 `isError` 回覆。
- `get_scene`：回物件摘要與可由 App 讀取的 v1 project payload。
- `open_scene`：回 `structuredContent.url` 與人類可讀文字，URL 格式為
  `.../#mcp=<base64url UTF-8 JSON>`。深連結過長會 fail closed。

所有成功工具都提供 `structuredContent`；工具層錯誤會提供 `isError: true`，不把既有
state 部分寫入。位置與旋轉在 server 內轉成 App 使用的 metre／radian。

## App 匯入閘門

App 啟動或 hashchange 看到 `#mcp=` 時，只會顯示繁中 Radix AlertDialog，列出場景名稱、
物件數與「會取代目前場景、清除 undo-redo」警告。確認才呼叫 `replaceScene`；取消或
完成後清除 hash，非法、過長或含 assets 的 payload 顯示不洩漏內容的錯誤訊息。
一般專案檔匯入的 File／貼圖語意不受 MCP 影響。

這個流程是「MCP 建場景 → `open_scene` 交回深連結 → 使用者在 App 確認」；不會無提示
遠端接管使用者已開啟的頁面，也不會繞過取代目前場景／清除 undo-redo 的確認對話框。

## 限制與驗證

MCP MVP 的 `assets` 固定為空陣列，也會拒絕任何 surface `texture` 參照；不支援貼圖上傳、
外部圖片 URL 或二進位資料。執行：

```bash
npm test
npx tsc --noEmit
npm run typecheck:mcp
npm run verify:mcp
npm run build
```

`verify:mcp` 會用官方 `@modelcontextprotocol/client`、`StdioClientTransport` 真正 spawn
server，執行 initialize、完整 tools/list，以及 `new_scene → add_object → open_scene`；
它不等同於正式站或瀏覽器的部署／視覺驗收。
