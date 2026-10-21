# 分數加法練習

協助數學能力較弱嘅香港小五學生練習**分數加法**（只做加法）。橫向介面、逐步核對、方法提示。

**老師：** 李文偉 · Iu Shan

## 本機開啟

純前端，唔使伺服器亦得：

```bash
# 方法 1：直接用瀏覽器打開
open index.html   # macOS
xdg-open index.html   # Linux

# 方法 2：本地靜態伺服器（建議，避免部分瀏覽器 file:// 限制）
cd /workspace/webapps/fraction-addition
python3 -m http.server 8765
# 然後開 http://localhost:8765/
```

請用**橫向**視窗／平板。直向手機會顯示「請橫放裝置」。

## 功能摘要

1. **學號門檻**：進入前必填學號（sessionStorage 記住）
2. **三級**：1 同分母 → 2 異分母無分數進位 → 3 異分母有分數進位
3. **左橫式／右提示**；提示可隱藏
4. **逐步自動核對**；錯唔跳步；完成後步驟回復正常大小方便回顧
5. **短除通分**留空自填
6. **公仔**：`assets/fraction_mascot_*.png`（未到位時用 emoji placeholder）

## 檔案

```
fraction-addition/
  index.html
  README.md
  css/styles.css
  js/math.js        # 分數運算、短除
  js/questions.js   # 出題（含 L2/L3 進位硬篩）
  js/steps.js       # 步驟軌跡同批改
  js/app.js         # 介面
  assets/           # 公仔 PNG（可後補）
```

## 公仔檔名（由大畫家提供後放入 assets/）

- `fraction_mascot_wave.png` — 起始頁
- `fraction_mascot_point.png` — 練習中
- `fraction_mascot_think.png` — 答錯
- `fraction_mascot_thumbsup.png` — 步驟答對
- `fraction_mascot_celebrate.png` — 全題完成

透明底 PNG；未提供時自動顯示 emoji。


## 級別 1 三關進度（老師設計）

| 關 | 內容 | 過關 |
|----|------|------|
| 第一關・真分數 | 同分母真分數、無約分、無進位 | 連續答對 3 題 |
| 第二關・帶分數 | 帶+帶／帶+真、無約分、無進位 | 連續答對 3 題 |
| 第三關・約分 | 隨機真／帶，每題問「有沒有約分」 | 連續 3 題後可「升級」或「重温一次」 |

單檔離線版：`分數加法練習.html`（內嵌 CSS／JS／公仔）。


## 遊玩紀錄與老師報表（r20）

每完成一題會記錄：**學號、級別／關卡階段、錯次、用時、完成時間**（不記姓名／班別）。

- 無 Firebase：成績暫存瀏覽器本機，練習不受影響。
- 有設定：匿名登入後寫入 Firestore。

### 老師開啟報表

```
index.html?teacher=1
```

或起始頁底部「老師報表」。輸入老師代號（預設 `default`）後可查看表格、篩選學號、下載 CSV，並貼上 Firebase JSON（只存本瀏覽器）。

### 學生上傳（部署前）

編輯 `js/firebase-config.js`，將 `window.FRACTION_ADDITION_FIREBASE_CONFIG` 設為真實 JSON 物件，再部署。設定會出現在前端，請在 Firestore 設定安全規則（見 `DEPLOY_NOTE.txt`）。

詳細步驟可參考倉庫根目錄 `firebase-guide.md`（功課系統教學；路徑與規則請改用本 app 的）。
