# 游承諺的個人網站

以 Astro 建立的個人介紹與技術部落格網站，用來整理個人經歷、文章與作品集。網站內容使用 Astro 元件與 MDX 撰寫，並另外收錄兩個可以直接在瀏覽器執行的 JavaScript 小遊戲。

## 內容

- **首頁**：個人簡介與作品連結
- **關於我**：開發經驗、技術興趣與個人介紹
- **部落格**：以 Markdown/MDX 發布技術文章
- **Counting Stars**：可建立多個計數清單的網頁工具
- **Tetris**：支援保留方塊、下一個方塊、排行榜與暫停功能的俄羅斯方塊遊戲

## 線上網站

- [個人網站](https://yanagi-0912.github.io/)
- [Counting Stars](./projects/CountingStars/index.html)
- [Tetris](./projects/Tetris/index.html)

## 使用技術

- [Astro](https://astro.build/)
- MDX
- TypeScript
- HTML / CSS / JavaScript
- Sharp（圖片處理）

## 開始使用

### 環境需求

- Node.js `>= 22.12.0`
- npm

### 安裝依賴

```bash
npm install
```

### 啟動開發伺服器

```bash
npm run dev
```

啟動後可在瀏覽器開啟終端機顯示的本機網址，通常是 `http://localhost:4321`。

### 建置正式版本

```bash
npm run build
```

建置結果會輸出至 `dist/`。若要在本機預覽正式版本：

```bash
npm run preview
```

## 專案結構

```text
.
├── projects/                 # 可獨立執行的前端小作品
│   ├── CountingStars/        # 計數清單工具
│   └── Tetris/               # 俄羅斯方塊遊戲
├── public/                   # 不需編譯的公開資源
├── src/
│   ├── assets/               # 圖片與字型等資源
│   ├── components/           # 共用 Astro 元件
│   ├── content/blog/         # 部落格文章（Markdown/MDX）
│   ├── layouts/              # 頁面版型
│   ├── pages/                # 網站路由與頁面
│   ├── consts.ts             # 網站共用設定
│   └── styles/               # 全域樣式
├── astro.config.mjs          # Astro 設定
└── package.json              # 指令與依賴設定
```

## 新增文章

在 `src/content/blog/` 新增 `.md` 或 `.mdx` 檔案，依照既有文章的 frontmatter 填寫標題、描述、日期與圖片等欄位。完成後重新啟動開發伺服器即可在 `/blog` 查看。

## 其他指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動開發伺服器 |
| `npm run build` | 建置正式版本 |
| `npm run preview` | 預覽正式版本 |
| `npm run astro -- check` | 執行 Astro 檢查 |

