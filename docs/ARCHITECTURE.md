# 架构说明

> 目标形态：**一个 Python 进程 + 一个 Calibre 目录**，`docker compose up` 即可用。
> 没有 Node 构建链，没有 Nginx，没有第二个数据库进程。

## 1. 全局结构

```
┌──────────────────────────── 浏览器 ────────────────────────────┐
│  书架页（封面墙 / 搜索 / 筛选）        阅读器页（epub.js）        │
│         └──────────── 共用 API 客户端 + 设计系统 ────────────┘  │
└───────────────────────────────┬────────────────────────────────┘
                                │ HTTP / JSON
┌───────────────────────────────▼────────────────────────────────┐
│                        FastAPI（单进程）                        │
│  /api/library  /api/books/{id}  /api/books/{id}/file/{fmt}      │
│  /api/books/{id}/progress  /bookmarks  /annotations             │
│       │                              │                          │
│       │ 只读                          │ 读写                     │
│       ▼                              ▼                          │
│  Calibre metadata.db            data/library.db (自有)          │
│  + 书文件（EPUB/PDF/…）          进度 · 书签 · 笔记              │
└─────────────────────────────────────────────────────────────────┘
```

## 2. 技术选型与理由

| 层 | 选择 | 理由 | 放弃的方案 |
|---|---|---|---|
| 后端 | FastAPI + uvicorn | 类型清晰、异步流式文件、自带 OpenAPI | Tornado（talebook 用法偏重）、Flask（异步流文件弱） |
| 书库数据 | 直接读 Calibre `metadata.db`（SQLite，只读） | 零迁移，Calibre 仍是唯一写入方 | 导入后复制一份元数据（双写冲突） |
| 自有数据 | 独立 SQLite `data/library.db` | 单文件备份，与书库解耦，升级不碰 Calibre | 写回 Calibre（破坏其数据） |
| 前端 | 原生 ES Modules + 手写 CSS | 无构建步骤 → 镜像小、升级快、NAS 友好；M1 规模不需要框架 | Vue 3 + Vite（需要 Node 工具链，部署变重） |
| 阅读内核 | epub.js（本地 vendored） | 成熟的分页/CFI/主题/高亮能力 | 自研渲染（成本过高）、iframe 直出（无 CFI） |
| PDF | 浏览器原生查看器（M1）→ pdf.js（M2） | M1 先保证可用，避免一次引入两套渲染内核 | 一开始就上 pdf.js |
| 部署 | Docker Compose | NAS/VPS 通用；`/library` 只读挂载 | 裸机脚本 |

**关键决策：Calibre 只读。** 任何写操作都不落到 Calibre 目录。好处是永不损坏书库、可与 Calibre 桌面端共存；代价是 Web 端不能直接改元数据（M2 通过 Calibre CLI 异步任务实现，并在完成后重新读取）。

**关键决策：零构建前端。** 用 `type="module"` 直接加载源码，第三方库放 `static/vendor/`。代价是没有打包压缩与 TS 类型；换来的是「改一行、刷一下」和极简部署。若前端规模超过约 30 个模块，再引入构建，届时按文件迁移而非重写。

## 3. 数据模型

### 3.1 读取的 Calibre 表

只依赖 Calibre 长期稳定的表，缺失时降级为空：

| 表 | 用途 |
|---|---|
| `books` | `id` `title` `sort` `path` `timestamp` `pubdate` `series_index` `has_cover` `uuid` |
| `authors` / `books_authors_link` | 作者（多对多） |
| `data` | 格式与文件名：`format` `name` `uncompressed_size` |
| `series` / `books_series_link` | 系列与序号 |
| `tags` / `books_tags_link` | 标签 |
| `comments` | 简介（HTML） |
| `publishers` / `books_publishers_link` | 出版社 |
| `identifiers` | ISBN 等 |
| `ratings` / `books_ratings_link` | 评分（Calibre 存 2–10，展示为 1–5 星） |
| `languages` / `books_languages_link` | 语言 |

文件路径规则：`{library}/{books.path}/{data.name}.{format.lower()}`；封面：`{library}/{books.path}/cover.jpg`。

**书籍身份**：对外用 Calibre `books.id`（库内稳定），同时返回 `uuid`。自有库按 `book_id` 关联；换库重建时用 `uuid` 兜底。

### 3.2 自有库 `data/library.db`

```sql
CREATE TABLE progress (
  book_id    INTEGER PRIMARY KEY,
  cfi        TEXT,              -- EPUB 定位
  percent    REAL DEFAULT 0,    -- 0..1
  page       INTEGER,           -- 页码型（漫画/PDF）
  updated_at TEXT NOT NULL
);

CREATE TABLE bookmarks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id    INTEGER NOT NULL,
  cfi        TEXT NOT NULL,
  label      TEXT NOT NULL,
  percent    REAL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE annotations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id    INTEGER NOT NULL,
  type       TEXT NOT NULL DEFAULT 'highlight',  -- highlight | note
  cfi        TEXT NOT NULL,      -- 选区 CFI
  quote      TEXT NOT NULL,      -- 原文
  note       TEXT DEFAULT '',
  color      TEXT DEFAULT 'yellow',
  chapter    TEXT DEFAULT '',
  percent    REAL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_annotations_book ON annotations(book_id, created_at);
```

沿用 talebook 的三条语义：**私有是默认**（M1 无多用户，天然私有）、**删除是真删除**、**进度与笔记是两套独立数据**。

## 4. API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/library` | 分页列表；参数 `q` `author` `tag` `series` `language` `sort` `page` `page_size`；返回 `items` `total` `facets` |
| GET | `/api/books/{id}` | 详情：元数据 + 格式清单 + 章节预览（EPUB 目录，惰性） |
| GET | `/api/books/{id}/cover` | 封面，带 ETag |
| GET | `/api/books/{id}/file/{fmt}` | 原文件流；`?inline=1` 用于 PDF 内联阅读 |
| GET | `/api/books/{id}/epub` | 便捷别名：返回 EPUB（不存在则 404） |
| GET / POST | `/api/books/{id}/progress` | 读 / 写进度 |
| GET / POST | `/api/books/{id}/bookmarks` | 书签列表 / 新建 |
| DELETE | `/api/bookmarks/{id}` | 删除书签 |
| GET / POST | `/api/books/{id}/annotations` | 划线笔记列表 / 新建 |
| PATCH / DELETE | `/api/annotations/{id}` | 改笔记 / 删除 |
| GET | `/api/config` | 站点名、是否启用登录、库路径统计 |
| GET | `/` `/book/{id}` `/read/{id}` | 前端页面 |

统一错误体：`{"detail": "..."}`；路径参数非法返回 400，资源不存在返回 404。

## 5. 阅读器

### 5.1 组成

- **宿主页** `/read/{id}`：工具栏、侧栏抽屉、设置面板、进度条。
- **渲染区**：epub.js `rendition` 注入的 iframe，书内容与宿主样式隔离。
- **状态层**：`reader.js` 持有 `book` / `rendition` / `location`，所有 UI 通过它读写。

### 5.2 关键行为

| 能力 | 实现 |
|---|---|
| 打开与恢复 | 先取 `/progress`，`rendition.display(cfi)`，无进度则 `display()` |
| 进度写入 | `relocation` 事件防抖 800ms 写库；`locations.generate(1500)` 后台生成用于百分比 |
| 翻页 | 分页模式 `next/prev`；滚动模式 `flow: 'scrolled-doc'`；键盘 ←/→/空格/Esc；触摸左右滑动 |
| 目录 | `book.loaded.navigation.toc` 递归渲染，点击 `display(href)` |
| 主题 | `themes.register()` 注册 4 套 CSS，`themes.select()` 即时切换并存本地 |
| 排版 | `themes.fontSize()`、`themes.override('line-height')`、字体族与页边距通过注入 CSS 变量 |
| 划线 | `rendition.on('selected')` → 浮动工具条 → 写库 → `annotations.highlight()` |
| 笔记 | 高亮后追加 `note`；侧栏可改可删，删除时 `annotations.remove()` |
| 书签 | 记当前 CFI + 章节名 + 百分比；侧栏列表 |
| 全文搜索 | 遍历 spine 抽取纯文本建内存索引，结果定位到章节并高亮首个命中 |
| 固定版式 | 检测 `rendition.layout === 'pre-paginated'` 时提示并禁用字体设置 |

### 5.3 布局模式

| 模式 | epub.js 配置 | 适用 |
|---|---|---|
| 单栏分页 | `flow: 'paginated', spread: 'none'` | 手机、窄窗口 |
| 双栏分页 | `flow: 'paginated', spread: 'auto'` | 宽屏 |
| 滚动 | `flow: 'scrolled-doc'` | 长文与论文式阅读 |

## 6. 安全

- 默认 `HOST=127.0.0.1`；容器内 `0.0.0.0`，对外由部署者决定是否暴露。
- 所有文件路径经 `Path.resolve()` 后校验必须位于库根目录内，禁止 `..` 穿越。
- 只允许 `data` 表登记的格式后缀与 `cover.jpg`，不提供任意文件浏览。
- 上传与元数据写入默认关闭（M1 无写书库接口）。
- 响应头：`X-Content-Type-Options: nosniff`；EPUB/PDF 以 `inline` 交付时可被浏览器渲染，但仅限本库文件。
- 可选 HTTP Basic 口令（`LIBRARY_PASSWORD`），用于把实例暴露到内网之外的最低成本保护。

## 7. 部署

```yaml
services:
  library:
    build: .
    ports: ["8080:8080"]
    environment:
      LIBRARY_PATH: /library
      DATA_DIR: /data
    volumes:
      - /path/to/Calibre Library:/library:ro
      - ./data:/data
```

- 镜像基于 `python:3.13-slim`，只装 `fastapi` `uvicorn` `python-multipart`。
- 书库只读挂载：容器无法破坏 Calibre 数据。
- 备份只需 `./data`（进度、书签、笔记）。

## 8. 与静态书房的关系

现有 Hugo 静态站（`content/` `layouts/` `assets/`）继续部署在 GitHub Pages，作为公开展示面。M4 计划把书架数据导出为 Hugo 内容目录，使「静态展示 + 自托管阅读」共用同一份元数据，而不是两套手工维护。
