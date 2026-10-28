# 演示书库

仓库里的 `demo-library/` 是一个真实的 Calibre 书库：有 `metadata.db`、按 `作者/书名 (id)/` 落盘的文件，以及每本书的 `cover.jpg`。它存在的意义是让任何人都能在没有 Calibre 的情况下把应用跑起来，同时覆盖书架需要的所有字段。

## 收录内容

| # | 书名 | 作者 | 年份 | 来源 |
|---|---|---|---|---|
| 1 | Pride and Prejudice | Jane Austen | 1813 | [Project Gutenberg #1342](https://www.gutenberg.org/ebooks/1342) |
| 2 | Alice's Adventures in Wonderland | Lewis Carroll | 1865 | [#11](https://www.gutenberg.org/ebooks/11) |
| 3 | Frankenstein; Or, The Modern Prometheus | Mary Shelley | 1818 | [#84](https://www.gutenberg.org/ebooks/84) |
| 4 | Moby Dick; Or, The Whale | Herman Melville | 1851 | [#2701](https://www.gutenberg.org/ebooks/2701) |
| 5 | The Time Machine | H. G. Wells | 1895 | [#35](https://www.gutenberg.org/ebooks/35) |
| 6 | The War of the Worlds | H. G. Wells | 1898 | [#36](https://www.gutenberg.org/ebooks/36) |
| 7 | Dracula | Bram Stoker | 1897 | [#345](https://www.gutenberg.org/ebooks/345) |
| 8 | The Picture of Dorian Gray | Oscar Wilde | 1890 | [#174](https://www.gutenberg.org/ebooks/174) |
| 9 | The Adventures of Sherlock Holmes | Arthur Conan Doyle | 1892 | [#1661](https://www.gutenberg.org/ebooks/1661) |
| 10 | The Great Gatsby | F. Scott Fitzgerald | 1925 | [#64317](https://www.gutenberg.org/ebooks/64317) |
| 11 | 星皓书房使用手册 | 星皓书房 | — | 专为本项目撰写 |

全部为公有领域作品。第 11 本是中文手册，用来检验 CJK 字体、行距与断行，也是阅读器排版的回归样本。

## 它覆盖了哪些字段

- **标签**：经典、英国文学、科幻、哥特、侦探、爱情、恐怖、唯美主义、美国文学、航海、童话、奇幻、中篇、短篇集、爵士时代、手册、本站。
- **系列**：`H. G. Wells 科幻`（两本，含 `series_index`）。
- **评分**：2–10（Calibre 以 2 为步长表示半星）。
- **语言**：`eng` 与 `zho`，用于语言筛选。
- **出版社**：Project Gutenberg / 星皓书房。
- **简介**：每本都写了中文简介，用于验证书架搜索命中与详情页排版。
- **封面**：10 本取自 Gutenberg 封面，手册封面由脚本绘制。

## 重新生成

```bash
pip install pillow
python tools/build_demo_library.py
```

脚本行为：

1. 从 `gutenberg.org` 下载 `.epub.noimages` 版本，缓存到 `tools/.cache/`。
2. 解析 OPF 元数据，写入 Calibre 的 `metadata.db`（books / authors / tags / series / ratings / languages / publishers / comments / identifiers 等表）。
3. 从 EPUB 中取封面，统一裁剪为 `cover.jpg`；取不到的按书名生成。
4. 已存在的文件跳过；`--refresh` 强制重新下载。

> `tools/.cache/` 已在 `.gitignore` 中。想换一批书，改脚本顶部的 `GUTENBERG` 列表即可——字段怎么映射，看那里最直接。

## 换成你自己的书库

演示库只是启动时的默认值。把 `LIBRARY_PATH`（或 Compose 里的挂载路径）指向 Calibre 的真实目录即可，应用不会碰演示库以外的任何东西：

```bash
LIBRARY_PATH="/path/to/Calibre Library" python -m app.main
```
