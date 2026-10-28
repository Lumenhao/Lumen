# 📚 星皓书房

个人数字图书馆 —— Hugo + KaTeX + pseudocode.js，推送到 GitHub 后自动构建并发布到 GitHub Pages。

## 快速开始

```bash
# 本地预览（Windows 双击 preview.bat 也可以）
./preview.bat          # 打开 http://localhost:1313/
```

## 加一本书

完整步骤见 **[使用说明.md](使用说明.md)**，最短路径：

1. 复制模板：`cp -r content/books/library-guide content/books/<新书 slug>`
2. 改 `_index.md` 的书名、简介、`categories`、`weight`，封面用 `{{< book-cover >}}` 自动生成
3. 删掉模板章节，写 `ch01.md`、`ch02.md`……（`weight` 用 10、20、30）
4. 图片放该书目录下的 `images/`，Markdown 里写 `images/xxx.jpg`
5. 保存，浏览器自动刷新——首页书架、封面墙、分类筛选全自动

排版元素（提示框、定理、例题、图注、伪代码）的写法见站内 **参考 → 元素速查**。

## 发布

```bash
git add -A && git commit -m "add: 新书" && git push
```

GitHub Actions 自动构建并推送到 `gh-pages` 分支；首次需要在仓库 **Settings → Pages** 里把 Source 设为 `gh-pages`。

## 结构

```
content/            内容：books / notes / papers / reference
layouts/            页面模板
assets/_custom.scss 样式
static/             KaTeX、搜索、主题切换
themes/hugo-book/   Hugo Book 主题（已内嵌）
scripts/            EPUB / OCR 输出清洗
```

## 致谢

站点结构与视觉设计参考 [Yuanuite/digital-library](https://github.com/yuanuite/digital-library)，其灵感来自 [UynajGI/yuulibrary](https://github.com/UynajGI/yuulibrary)。主题为 [hugo-book](https://github.com/alex-shpak/hugo-book)。

## 许可证

MIT，见 [LICENSE](LICENSE)。
