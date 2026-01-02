> [!NOTE]
> 此擴充套件（v1.0.10+）現在已支援 Nano Banana Pro（`gemini-3-pro-image-preview`）！
>
> 將 `NANOBANANA_MODEL` 環境變數設定為 `gemini-3-pro-image-preview` 即可使用。

# Nano Banana - Gemini CLI 擴充套件

一款專業的 Gemini CLI 擴充套件，可使用 Nano Banana 模型進行圖片生成與編修。

## ✨ 功能特色

- **🎨 文字轉圖片生成**：依照描述式提示詞生成高品質圖片
- **✏️ 圖片編修**：用自然語言指令修改既有圖片
- **🔧 圖片修復**：修復並強化老舊或受損照片
- **📁 智慧檔案管理**：以友善檔名儲存，並自動避免重複檔名
- **🏷️ 自訂輸出檔名**：支援 `--filename` 指定檔名，多張輸出自動加後綴

## 📋 前置需求

1. 已安裝並完成設定的 **Gemini CLI**
2. **Node.js 20+** 與 npm
3. **API Key**：設定下列任一環境變數：
   - `NANOBANANA_GEMINI_API_KEY`（建議給 Gemini API Key 使用者；通常會在 Gemini CLI 以「Login with Google」方式驗證）
   - `NANOBANANA_GOOGLE_API_KEY`（建議給 Vertex API Key 使用者；通常會在 Gemini CLI 以「Login with Google」方式驗證）
   - `GEMINI_API_KEY`（備援）
   - `GOOGLE_API_KEY`（備援）

關於驗證設定，請參考 [Gemini CLI 官方文件](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/authentication.md)。

### 主要組成

- **`index.ts`**：使用 `@modelcontextprotocol/sdk` 的 MCP Server，提供完整且穩健的通訊協定處理
- **`imageGenerator.ts`**：處理所有 Gemini API 互動與回應解析
- **`fileHandler.ts`**：處理檔案 I/O、智慧檔名生成與檔案搜尋
- **`types.ts`**：共用 TypeScript 介面，確保型別安全

## 🍌 模型選擇

此擴充套件支援兩種 Nano Banana 模型：

- `gemini-2.5-flash-image`（預設）
- `gemini-3-pro-image-preview`（Nano Banana Pro）

預設使用 `gemini-2.5-flash-image`。

若要使用新版 Gemini 3 Pro 驅動的模型，請將 `NANOBANANA_MODEL` 環境變數設定為 `gemini-3-pro-image-preview`。

```bash
export NANOBANANA_MODEL=gemini-3-pro-image-preview
```

## 🚀 安裝

### 1. 安裝擴充套件

使用 `gemini extensions install` 指令安裝：

```bash
gemini extensions install https://github.com/doggy8088/nanobanana
```

### 2. 啟用

重新啟動 Gemini CLI 後，會提供下列指令：

- `/generate` - 生成單張或多張圖片（支援風格/變化選項）
- `/edit` - 圖片編修
- `/restore` - 圖片修復
- `/icon` - 生成多尺寸的 App 圖示、Favicon 與 UI 元件
- `/pattern` - 生成可無縫拼接的圖樣與背景材質
- `/story` - 生成可呈現視覺故事或流程的連續圖片
- `/diagram` - 生成技術圖表、流程圖與架構示意
- `/nanobanana` - 自然語言介面

## 💡 使用方式

此擴充套件針對不同情境提供多種指令選項：

### 🎯 指定指令（推薦）

**生成圖片：**

```bash
# 單張圖片
/generate "一幅水彩畫：雪地森林裡的狐狸"

# 多張變體（含預覽）
/generate "群山日落" --count=3 --preview

# 指定輸出檔名（多張自動加後綴）
/generate "群山日落" --count=3 --filename="sunset_mountains"

# 風格變體
/generate "山景風光" --styles="watercolor,oil-painting" --count=4

# 指定變化類型（自動預覽）
/generate "咖啡店室內" --variations="lighting,mood" --preview
```

**編修圖片：**

```bash
/edit my_photo.png "幫人物加上太陽眼鏡"
/edit my_photo.png "幫人物加上太陽眼鏡" --filename="with_sunglasses"
/edit portrait.jpg "把背景改成海灘" --preview
```

**修復圖片：**

```bash
/restore old_family_photo.jpg "移除刮痕並提升清晰度"
/restore damaged_photo.png "增強色彩並修補撕裂" --preview
```

**生成圖示：**

```bash
# 多尺寸 App 圖示
/icon "咖啡杯 logo" --sizes="64,128,256" --type="app-icon" --preview

# Favicon 組合
/icon "公司 logo" --type="favicon" --sizes="16,32,64"

# UI 元件
/icon "設定齒輪圖示" --type="ui-element" --style="minimal"
```

**建立圖樣：**

```bash
# 無縫拼接圖樣
/pattern "幾何三角形" --type="seamless" --style="geometric" --preview

# 背景材質
/pattern "木紋材質" --type="texture" --colors="mono"

# 桌布圖樣
/pattern "花卉設計" --type="wallpaper" --density="sparse"
```

**生成故事序列：**

```bash
# 視覺故事序列
/story "一顆種子長成樹" --steps=4 --type="process" --preview

# 逐步教學
/story "如何煮咖啡" --steps=6 --type="tutorial"

# 時間軸視覺化
/story "智慧型手機的演進" --steps=5 --type="timeline"
```

**建立技術圖表：**

```bash
# 系統流程圖
/diagram "使用者登入流程" --type="flowchart" --style="professional" --preview

# 系統架構圖
/diagram "微服務架構" --type="architecture" --complexity="detailed"

# 資料庫結構
/diagram "電商資料庫設計" --type="database" --layout="hierarchical"
```

### 🌟 自然語言指令（彈性）

**開放式提示詞：**

```bash
/nanobanana 幫我的科技新創做一個 logo
/nanobanana 我需要 5 種不同版本的貓插畫，包含多種藝術風格
/nanobanana 調整 sunset.jpg 的光線，讓它更鮮豔有活力
```

## 🎨 進階生成選項

`/generate` 指令支援進階選項，可生成多個變體並套用不同風格與參數。

### 生成選項

**`--count=N`** - 變體數量（1-8，預設：1）
**`--styles="style1,style2"`** - 以逗號分隔的藝術風格清單
**`--variations="var1,var2"`** - 指定變化類型
**`--format=grid|separate`** - 輸出格式（預設：separate）
**`--resolution=1K|2K|4K`** - 輸出解析度（預設：2K）
**`--seed=123`** - 用於重現結果的隨機種子
**`--filename="name"`** - 指定輸出檔名（多張自動加後綴）
**`--preview`** - 自動使用預設檢視器開啟生成圖片

### 可用風格

- `photorealistic` - 寫實攝影風格
- `watercolor` - 水彩畫風
- `oil-painting` - 油畫技法
- `sketch` - 手繪素描風
- `pixel-art` - 復古像素風
- `anime` - 動漫/漫畫風
- `vintage` - 復古/懷舊美學
- `modern` - 當代/現代風格
- `abstract` - 抽象藝術風
- `minimalist` - 乾淨、極簡設計

### 可用變化類型

- `lighting` - 不同光線條件（戲劇化、柔和）
- `angle` - 不同視角（俯視、特寫）
- `color-palette` - 不同配色（暖色、冷色）
- `composition` - 不同構圖（置中、三分法）
- `mood` - 不同情緒氛圍（愉快、戲劇化）
- `season` - 不同季節（春、冬）
- `time-of-day` - 不同時段（日出、日落）

### 進階範例

**風格變體：**

```bash
/generate "山景風光" --styles="watercolor,oil-painting,sketch,photorealistic"
# 以 4 種不同藝術風格生成同一個山景場景
```

**多種變化：**

```bash
/generate "溫馨咖啡店" --variations="lighting,mood" --count=4
# 生成：戲劇化光線、柔和光線、愉快氛圍、戲劇化氛圍 4 種版本
```

**組合選項：**

```bash
/generate "友善的機器人角色" --styles="anime,minimalist" --variations="color-palette"
# 以不同配色生成動漫與極簡兩種版本
```

**簡單多張生成：**

```bash
/generate "科技新創 logo" --count=6
# 針對同一提示詞生成 6 種不同詮釋
```

## 🎯 圖示生成

`/icon` 指令專門用於生成 App 圖示、Favicon 與 UI 元件，並提供正確尺寸與格式化輸出。

### 圖示選項

**`--sizes="16,32,64"`** - 圖示尺寸（像素）陣列（常見：16, 32, 64, 128, 256, 512, 1024）
**`--type="app-icon|favicon|ui-element"`** - 圖示類型（預設：app-icon）
**`--style="flat|skeuomorphic|minimal|modern"`** - 視覺風格（預設：modern）
**`--format="png|jpeg"`** - 輸出格式（預設：jpeg）
**`--background="transparent|white|black|color"`** - 背景類型（預設：transparent）
**`--corners="rounded|sharp"`** - App 圖示圓角樣式（預設：rounded）
**`--filename="name"`** - 指定輸出檔名（搭配 `--sizes` 時，後綴使用尺寸）

### 圖示範例

```bash
# 完整 App 圖示套件
/icon "待辦清單的生產力 App" --sizes="64,128,256,512" --corners="rounded"

# 網站 Favicon 套件
/icon "山形 logo" --type="favicon" --sizes="16,32,64" --format="png"

# UI 元件套件
/icon "通知鈴鐺" --type="ui-element" --style="flat" --background="transparent"
```

## 🎨 圖樣與材質生成

`/pattern` 指令可建立可無縫拼接的圖樣與材質，適合用於背景與設計元素。

### 圖樣選項

**`--size="256x256"`** - 圖樣單元尺寸（常見：128x128, 256x256, 512x512）
**`--type="seamless|texture|wallpaper"`** - 圖樣類型（預設：seamless）
**`--style="geometric|organic|abstract|floral|tech"`** - 圖樣風格（預設：abstract）
**`--density="sparse|medium|dense"`** - 元素密度（預設：medium）
**`--colors="mono|duotone|colorful"`** - 配色方案（預設：colorful）
**`--repeat="tile|mirror"`** - 無縫拼接方式（預設：tile）
**`--filename="name"`** - 指定輸出檔名（搭配 `--size` 時，後綴使用尺寸）

### 圖樣範例

```bash
# 網站背景圖樣
/pattern "低調的幾何六角形" --type="seamless" --colors="duotone" --density="sparse"

# 材質紋理
/pattern "拉絲金屬表面" --type="texture" --style="tech" --colors="mono"

# 裝飾桌布
/pattern "裝飾藝術（Art Deco）設計" --type="wallpaper" --style="geometric" --size="512x512"
```

## 📖 視覺敘事

`/story` 指令可生成連續圖片，用於說故事或呈現逐步流程。

### 故事選項

**`--files="file1.jpg,file2.png"`** - 參考圖片（1-14 張，以逗號分隔）
**`--steps=N`** - 序列圖片張數（2-8，預設：4）
**`--type="story|process|tutorial|timeline"`** - 序列類型（預設：story）
**`--style="consistent|evolving"`** - 各格之間的視覺一致性（預設：consistent）
**`--layout="separate|grid|comic"`** - 輸出排版（預設：separate）
**`--transition="smooth|dramatic|fade"`** - 步驟間轉場風格（預設：smooth）
**`--format="storyboard|individual"`** - 輸出格式（預設：individual）
**`--filename="name"`** - 指定輸出檔名（多張自動加後綴）
**`--parallel=N`** - 並行生成張數（1-8，預設：2）
**`--preview`** - 生成後自動預覽

故事序列不會自動參考前一張圖片；若提供 `--files` 參考圖，整個系列都會以該參考圖（或參考圖組）為基準來保持一致性。

### 故事範例

```bash
# 產品開發流程
/story "從點子到產品上線" --steps=5 --type="process" --style="consistent"

# 教育型教學
/story "git 工作流程教學" --steps=6 --type="tutorial" --layout="comic"

# 品牌演進時間軸
/story "公司 logo 的演進" --steps=4 --type="timeline" --transition="smooth"
```

## 📊 技術圖表

`/diagram` 指令可從簡單文字描述生成專業的技術圖表、流程圖與架構示意。

### 圖表選項

**`--type="flowchart|architecture|network|database|wireframe|mindmap|sequence"`** - 圖表類型（預設：flowchart）
**`--style="professional|clean|hand-drawn|technical"`** - 視覺風格（預設：professional）
**`--layout="horizontal|vertical|hierarchical|circular"`** - 版面配置方向（預設：hierarchical）
**`--complexity="simple|detailed|comprehensive"`** - 細節程度（預設：detailed）
**`--colors="mono|accent|categorical"`** - 配色方案（預設：accent）
**`--annotations="minimal|detailed"`** - 標註與註解程度（預設：detailed）
**`--filename="name"`** - 指定輸出檔名

### 圖表類型與使用情境

- **flowchart**：流程、決策樹、工作流程
- **architecture**：系統架構、微服務、基礎設施
- **network**：網路拓樸、伺服器配置
- **database**：資料庫結構、實體關係
- **wireframe**：UI/UX 線框稿、頁面配置
- **mindmap**：心智圖、概念層級
- **sequence**：時序圖、API 互動

### 圖表範例

```bash
# 開發流程
/diagram "包含測試階段的 CI/CD pipeline" --type="flowchart" --complexity="detailed"

# 系統設計
/diagram "聊天應用程式架構" --type="architecture" --style="technical"

# API 文件
/diagram "REST API 驗證流程" --type="sequence" --layout="vertical"

# 資料庫設計
/diagram "社群媒體資料庫結構" --type="database" --annotations="detailed"
```

## 📁 檔案管理

### 智慧檔名生成

圖片會依據提示詞以友善檔名儲存：

- `"sunset over mountains"` → `sunset_over_mountains.jpg`
- `"abstract art piece"` → `abstract_art_piece.jpg`

### 自訂檔名

使用 `--filename="name"` 可指定輸出檔名：

- 單張：`/generate "山景" --filename="mountain_view"` → `mountain_view.jpg`
- 多張：`/generate "山景" --count=3 --filename="mountain_view"` → `mountain_view_1.jpg`, `mountain_view_2.jpg`, `mountain_view_3.jpg`

### 自動避免重複檔名

若檔案已存在，會自動加上計數：

- `sunset_over_mountains.jpg`
- `sunset_over_mountains_1.jpg`
- `sunset_over_mountains_2.jpg`

### 檔案搜尋位置

進行編修/修復時，會在以下位置搜尋輸入圖片：

1. 目前工作目錄
2. `./images/` 子目錄
3. `./input/` 子目錄
4. `./nanobanana-output/` 子目錄
5. `~/Downloads/`
6. `~/Desktop/`

### 輸出目錄

生成圖片會儲存到 `./nanobanana-output/`（會自動建立）。

## 🛠️ 開發

### 建置指令

```bash
# 建置 MCP server
npm run build

# 安裝 MCP server 依賴
npm run install-deps

# 開發模式（監聽檔案變更）
npm run dev
```

### MCP Server 指令

```bash
# 直接建置 MCP server
cd mcp-server && npm run build

# 單獨啟動 server（用於測試）
cd mcp-server && npm start

# 開發模式（TypeScript watch）
cd mcp-server && npm run dev
```

### 版本更新發佈

要發佈新版本，請依照以下步驟進行：

1. **自動更新版本號碼**

   ```bash
   npm run bump
   ```

   此指令會自動更新版本號碼並產生變更記錄。

2. **提交並推送變更**

   ```bash
   git add .
   git commit -m "chore: bump version"
   git push
   ```

   推送到儲存庫後，CI/CD pipeline 會自動執行並發佈新版本。

## 🔧 技術細節

### MCP Server 通訊協定

此擴充套件使用官方 Model Context Protocol（MCP）SDK，以提供穩健的 Client/Server 通訊：

- **Protocol**：JSON-RPC over stdio
- **SDK**：`@modelcontextprotocol/sdk`
- **Tools**：`generate_image`, `edit_image`, `restore_image`

### API 整合

- **Model**：`gemini-2.5-flash-image`
- **SDK**：`@google/genai`
- **Response Handling**：針對圖片資料偵測提供多個備援位置

### 錯誤處理

- 提供包含除錯資訊的完整錯誤訊息
- API 回應解析提供優雅的備援處理
- 進行檔案驗證並回報搜尋路徑

## 🐛 疑難排解

### 常見問題

1. **「Command not recognized」**：確認擴充套件位於 `~/.gemini/extensions/nanobanana-extension/`，並已重新啟動 Gemini CLI

2. **「No API key found」**：請設定 `GEMINI_API_KEY` 環境變數：

   ```bash
   export GEMINI_API_KEY="your-api-key-here"
   ```

3. **「Build failed」**：確認已安裝 Node.js 18+，並執行：

   ```bash
   npm run install-deps && npm run build
   ```

4. **「Image not found」**：確認輸入檔案位於其中一個搜尋目錄（見上方「檔案搜尋位置」）

### 除錯模式

MCP server 內含詳細除錯紀錄，會顯示於 Gemini CLI 的主控台，方便診斷問題。

## 📄 法務

- **License**：[Apache License 2.0](LICENSE)
- **Security**：[Security Policy](SECURITY.md)

## 🤝 貢獻

1. Fork 此儲存庫
2. 建立功能分支
3. 依照模組化架構進行修改
4. 執行 `npm run build` 確保可編譯
5. 使用 Gemini CLI 進行測試
6. 提交 Pull Request
