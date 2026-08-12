# Exhibit Studio

Exhibit Studio 是給展場設計與布展人員的瀏覽器 3D 模擬工具。用參數化展櫃、貼圖、假人與道具，快速確認尺寸、比例與配置。

## 立即開始

Live demo：<https://exhibit-studio.vercel.app>

需求：Node.js 20 以上（含 npm）。

```bash
git clone https://github.com/lotushj1/exhibit-studio.git
cd exhibit-studio
npm ci
npm run dev
```

開發伺服器預設在 <http://localhost:5180>。

## 核心功能

- 參數化展櫃：方箱展台、玻璃罩高櫃、開放層架、主視覺背板。
- 假人與道具：假人、椅子、板凳、箱子、小櫃子、桌面立牌。
- 每面獨立材質與貼圖，支援填滿、完整顯示、平鋪與原色顯示。
- 透視／正交投影、深色／淺色外觀、尺寸標註與 1x／2x PNG 截圖。
- Cmd/Ctrl+Z、Cmd/Ctrl+Shift+Z 復原與重做。

## 基本操作

1. 在左欄「物件庫」加入展櫃、假人或道具。
2. 點選物件後，在右欄調整尺寸、材質、貼圖與角度。
3. 在物件上拖曳可沿地面移動；按住 Shift 會以 10 公分貼齊。
4. 用 Q／E 旋轉 15 度，Cmd/Ctrl+D 複製，Delete／Backspace 刪除。
5. 從頂列切換投影、外觀、尺寸標註或下載截圖。

快捷鍵在輸入框、下拉選單、滑桿與其他控制項聚焦時不會觸發。

## 儲存、匯出與匯入

Exhibit Studio 採 local-first 設計：場景結構自動存於瀏覽器 `localStorage`，貼圖存於 IndexedDB。重新整理後會在同一個瀏覽器還原。

要換裝置或分享給同事，使用「專案檔」匯出／匯入單一 JSON；貼圖會一起內嵌，不需要後端帳號或上傳服務。

## 開發指引

```bash
npm test
npx tsc --noEmit
npm run build
```

請先閱讀 [貢獻指南](./CONTRIBUTING.md)；物件 schema、存檔格式、部署驗證與其他維護細節請見 [開發文件](./docs/DEVELOPMENT.md)。

## 目前限制

- 2x 截圖會以 4 倍像素重新渲染，因此比 1x 截圖花費更多時間。
- 需要瀏覽器支援 WebGL；不支援時會顯示說明頁，沒有 2D 渲染 fallback。

## 授權

本專案採 [MIT License](./LICENSE) 授權。歡迎提交修正、功能與文件貢獻。
