# 貢獻指南 / Contributing

感謝你想改善 Exhibit Studio！這是一個 local-first 的瀏覽器端工具，歡迎針對功能、修正與文件提出小而清楚的變更。

## 開始開發

需求：Node.js 20 以上。

```bash
git clone https://github.com/lotushj1/exhibit-studio.git
cd exhibit-studio
npm ci
npm run dev
```

請先閱讀 [README](./README.md) 的操作與已知限制。場景儲存在瀏覽器 `localStorage`、貼圖儲存在 IndexedDB；目前沒有後端上傳或遙測流程，請不要把使用者資料、`.env` 檔或密鑰提交到儲存庫。

## 修改與驗證

- 每個變更保持單一目的，延續現有 TypeScript、React 與測試風格。
- 提交前執行 `npm test`、`npm run build` 與 `git diff --check`。
- 若修改互動或 3D 顯示，請在本機開發伺服器實際操作並在 PR 描述測試範圍與已知限制。
- 不要把 `dist/`、`node_modules/`、`.vercel/` 或機密資料加入 commit。

## 提交變更

請從自己的分支開發，提交清楚的 commit，並在 Pull Request 說明：變更內容、驗證命令、必要的畫面或重現步驟，以及任何尚未處理的限制。維護者會檢查測試、文件與 local-first 行為後再合併。

By contributing, you agree that your contributions are provided under the project’s [MIT License](./LICENSE). Please keep pull requests focused, explain how you tested them, and call out any known limitations.
