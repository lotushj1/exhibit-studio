# 品質收尾紀錄

## 階段 2 minor 複查

## 逐項結論

1. 拖曳位移雙重疊加：以生產頁面主鍵拖曳並讀回 `localStorage` 位置，再按一次 `Control+Z`。目前 `useDragOnGround` 以固定 `startPos` 加地面 delta，sceneStore live gesture 只提交一筆歷史；位置由 `[0,0,0]` 變為 `[0.0051403311,0,-0.5979142891]`，一次 undo 回原點。問題不存在，跳過程式修正。
2. 材質常駐 transparent：檢查 `resolveFinish` 與 `SurfaceMaterial`。消光、亮面、金屬、木紋等不透明 finish 未設 `transparent`，壓克力、清玻璃、霧面玻璃明確設為 `true`；材質 map 布林變化已有 `needsUpdate` effect。問題不存在，跳過程式修正。
3. 動畫中按 Esc：生產頁面切換相機預設後立即按 Esc，基線 canvas hash 持續變化至約 600ms，確認 tween 未取消。新增取消事件，Escape 先清除 tween，再只在非輸入控制項清除 selection；修後 100ms Escape 後 hash 於約 114ms 固定，console 無錯。

## 驗證

- targeted tests：5 files、96 tests 綠（相機 16、鍵盤 2、拖曳 6、材質 7、sceneStore 65）。
- 完整 `npm test` 與 `npx tsc --noEmit` 於本次提交前執行。
- 本機頁面：`http://127.0.0.1:5181/`，真實 pointer drag、Control+Z、相機預設與 Escape 均已觸發；瀏覽器 `window.__consoleErrors` 為空。

## 階段 3：投影切換 fallback

### 原計畫與量測結論

原計畫是在 production preview 的真人前景 Chrome 中，先確認頁面可見且視窗取得焦點（`document.visibilityState`、`document.hasFocus()`），再以 `requestAnimationFrame` 觀察切換期間的第一個有效 frame，並搭配 WebGL draw／畫面回復確認，才記錄投影切換成本。

兩輪工具方向均未在時限內回傳 foreground gate 或有效樣本，因此沒有可信毫秒數，也不能由背景分頁或不完整樣本推估場景／貼圖數量與成本的關聯。依 fail-closed 規則，不重試已失敗的量測方向。

### 當時的 UX fallback（已被後續改善取代）

階段 3 當時保留以 `key={projection}` 重建 Canvas/WebGL context 的架構，並以「切換投影中…」提示遮住重建期間。這是當時在量測受阻後採用的 fallback，不是目前實作。

未來若要取得重量測，應在真人前景 Chrome 重新通過 production、visibility、focus、rAF 與 WebGL draw gates，再記錄可重現的樣本。

### 後續改善（2026-08-12）

目前已改為在同一個 Canvas 內交換透視與正交相機，不再銷毀 WebGL context，也不再需要切換遮罩。Production 頁面實測切換前後皆維持單一 Canvas，兩種投影都能正常渲染。

貼圖清理也改為同時檢查目前場景、undo 與 redo 歷史。只有三者都不再參照的資產才會自動移除；啟動清理只處理原本從 IndexedDB 載入的資產，不會誤刪同期間剛上傳、尚未貼到物件的新圖片。
