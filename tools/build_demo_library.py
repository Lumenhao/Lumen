#!/usr/bin/env python3
"""生成演示用 Calibre 书库。

从 Project Gutenberg 下载公版 EPUB，抽取元数据与封面，按 Calibre 的
目录结构与 metadata.db 落盘。另外生成一本自撰的中文手册，用于检验 CJK 排版。

用法：
    python tools/build_demo_library.py [--out demo-library] [--refresh]

脚本可重复执行：已存在的文件会跳过，--refresh 强制重新下载。
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import io
import json
import re
import shutil
import sqlite3
import sys
import urllib.request
import uuid
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from xml.etree import ElementTree as ET

from PIL import Image, ImageDraw, ImageFont

NS = {
    "c": "urn:oasis:names:tc:opendocument:xmlns:container",
    "opf": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
}
UA = {"User-Agent": "XinghaoLibrary/0.1 (demo library builder)"}
TODAY = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
TZ = "+00:00"


@dataclass
class Book:
    gid: str
    title: str
    author: str
    tags: list[str] = field(default_factory=list)
    series: str | None = None
    series_index: float = 1.0
    rating: int = 0  # 0 = 未评分，否则 2..10
    publisher: str = "Project Gutenberg"
    published: str = "1900-01-01"
    language: str = "eng"
    description: str = ""
    epub: bytes | None = None
    cover: Image.Image | None = None


GUTENBERG = [
    Book("1342", "Pride and Prejudice", "Austen, Jane",
         ["经典", "英国文学", "爱情"], rating=10, published="1813-01-28",
         description="班纳特家五个女儿的婚恋故事。奥斯汀以精确的对话与反讽，写尽乡绅阶层的体面与算计。"),
    Book("11", "Alice's Adventures in Wonderland", "Carroll, Lewis",
         ["童话", "英国文学", "奇幻"], rating=8, published="1865-11-26",
         description="爱丽丝追着一只揣怀表的兔子掉进洞中。荒诞、语言游戏与逻辑悖论交织的儿童文学经典。"),
    Book("84", "Frankenstein; Or, The Modern Prometheus", "Shelley, Mary Wollstonecraft",
         ["科幻", "哥特", "英国文学"], rating=8, published="1818-01-01",
         description="维克多·弗兰肯斯坦用尸块拼出生命，又因恐惧抛弃了自己的造物。第一部真正意义上的科幻小说。"),
    Book("2701", "Moby Dick; Or, The Whale", "Melville, Herman",
         ["经典", "航海", "美国文学"], rating=6, published="1851-10-18",
         description="亚哈船长追捕白鲸的故事。既是航海百科，也是关于执念的寓言。"),
    Book("35", "The Time Machine", "Wells, H. G.",
         ["科幻", "中篇", "英国文学"], series="H. G. Wells 科幻", series_index=1.0,
         rating=8, published="1895-01-01",
         description="时间旅行者驶向八十万年后，看见人类分化为两个物种。"),
    Book("36", "The War of the Worlds", "Wells, H. G.",
         ["科幻", "英国文学"], series="H. G. Wells 科幻", series_index=2.0,
         rating=6, published="1898-01-01",
         description="火星人降落伦敦郊外，人类文明在几周内崩塌。"),
    Book("345", "Dracula", "Stoker, Bram",
         ["哥特", "恐怖", "英国文学"], rating=6, published="1897-05-26",
         description="以日记与书信拼成的吸血鬼故事。恐惧来自信件抵达得太晚。"),
    Book("174", "The Picture of Dorian Gray", "Wilde, Oscar",
         ["经典", "英国文学", "唯美主义"], rating=8, published="1890-07-01",
         description="画像替多里安·格雷老去，而他本人永远年轻。王尔德唯一的长篇小说。"),
    Book("1661", "The Adventures of Sherlock Holmes", "Doyle, Arthur Conan",
         ["侦探", "短篇集", "英国文学"], rating=10, published="1892-10-14",
         description="十二个短篇，福尔摩斯与华生的黄金时代。"),
    Book("64317", "The Great Gatsby", "Fitzgerald, F. Scott",
         ["经典", "美国文学", "爵士时代"], rating=8, published="1925-04-10",
         description="盖茨比在长岛对岸点亮一盏绿灯。关于美国梦最锋利的一次注视。"),
]


# ---------------------------------------------------------------- 下载与解析

def download(book: Book, cache: Path, refresh: bool) -> None:
    path = cache / f"{book.gid}.epub"
    if refresh or not path.exists():
        url = f"https://www.gutenberg.org/ebooks/{book.gid}.epub.noimages"
        print(f"  下载 #{book.gid} …", end="", flush=True)
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = resp.read()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        print(f" {len(data) // 1024} KB")
    book.epub = path.read_bytes()


def opf_root(epub: bytes) -> tuple[ET.Element, str]:
    with zipfile.ZipFile(io.BytesIO(epub)) as zf:
        container = ET.fromstring(zf.read("META-INF/container.xml"))
        rootfile = container.find(".//c:rootfile", NS)
        opf_path = rootfile.attrib["full-path"]
        return ET.fromstring(zf.read(opf_path)), opf_path


def series_from_epub(epub: bytes) -> str | None:
    try:
        root, _ = opf_root(epub)
    except Exception:
        return None
    for meta in root.iter("{http://www.idpf.org/2007/opf}meta"):
        if meta.attrib.get("name") == "calibre:series":
            return meta.attrib.get("content") or None
    return None


def cover_from_epub(epub: bytes) -> Image.Image | None:
    try:
        with zipfile.ZipFile(io.BytesIO(epub)) as zf:
            root, opf_path = opf_root(epub)
            base = Path(opf_path).parent
            manifest = {}
            cover_id = None
            for item in root.iter("{http://www.idpf.org/2007/opf}item"):
                manifest[item.attrib.get("id")] = item
                if "cover-image" in (item.attrib.get("properties") or ""):
                    cover_id = item.attrib.get("id")
            if cover_id is None:
                for meta in root.iter("{http://www.idpf.org/2007/opf}meta"):
                    if meta.attrib.get("name") == "cover":
                        cover_id = meta.attrib.get("content")
            if cover_id is None or cover_id not in manifest:
                return None
            href = manifest[cover_id].attrib["href"]
            raw = zf.read(str(base / href).replace("\\", "/"))
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        if max(img.size) < 300:  # Gutenberg 的部分封面是极小的占位图
            return None
        return img
    except Exception:
        return None


def plain_text(html_text: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", html_text or "", flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


# ---------------------------------------------------------------- 自撰中文手册

MANUAL_CSS = """
body { font-family: "Songti SC", "Noto Serif CJK SC", serif; line-height: 1.75; margin: 0; }
h1 { font-size: 1.6em; margin: 2em 0 1em; }
h2 { font-size: 1.25em; margin: 1.8em 0 .8em; }
p { text-indent: 2em; margin: 0 0 .9em; }
blockquote { margin: 1.2em 0; padding: .6em 1em; border-left: 3px solid #b08d57; color: #555; }
code { font-family: "Cascadia Code", Consolas, monospace; font-size: .9em; }
pre { background: #f4f1ea; padding: 1em; overflow-x: auto; }
li { margin: .3em 0; }
"""

MANUAL_PAGES = [
    ("ch01", "第一章 · 这座书房是什么",
     """
     <p>星皓书房由两部分组成：一个是运行在你自己的机器上的自托管应用，负责书架、阅读器与阅读记录；另一个是发布在 GitHub Pages 上的静态书房，负责公开展示。</p>
     <p>自托管应用直接读取 Calibre 的 <code>metadata.db</code>。它不会修改你的书库，也不会把书复制到别的地方。Calibre 仍然是你唯一的藏书入口。</p>
     <blockquote>把书交给 Calibre，把阅读交给我们。</blockquote>
     """,
     ),
    ("ch02", "第二章 · 怎么开始读",
     """
     <p>打开首页，你会看到一面封面墙。点击任意一本书进入详情页，再点「开始阅读」，就会进入阅读器。</p>
     <h2>翻页</h2>
     <p>桌面端可以使用左右方向键、空格键，或点击页面两侧的空白区域。手机和平板可以直接左右滑动。按 Esc 收起侧栏或返回书架。</p>
     <h2>排版</h2>
     <p>右上角的「Aa」按钮会打开排版面板。字号、行距、页边距、字体与主题都可以即时调整，选择会被记住。夜间主题只影响书页，不影响书架。</p>
     """,
     ),
    ("ch03", "第三章 · 划线、笔记与书签",
     """
     <p>在正文里选中一段文字，会浮出工具条：可以选颜色高亮，也可以直接写一条笔记。所有批注都会进入左侧的「笔记」列表，点击即可回到原文。</p>
     <p>书签记录的是当前位置，不需要选中文字。读到一半想留个记号，点顶部工具栏的书签图标即可。</p>
     <h2>进度</h2>
     <p>阅读位置会自动保存。换一台设备打开同一本书，会回到你上次停下的那一句。</p>
     """,
     ),
    ("ch04", "第四章 · 把书放进书架",
     """
     <p>在 Calibre 桌面端添加书籍，确认封面与元数据，然后在星皓书房里刷新页面。新书会自动出现在封面墙上。</p>
     <p>建议在 Calibre 中补齐作者、系列、标签与简介：书架页的筛选和排序都依赖这些字段。</p>
     <pre>Calibre → 首选项 → 更改 Calibre 库
确认目录后，把该目录填进 LIBRARY_PATH</pre>
     <p>如果一本书有多个格式，应用会优先使用 EPUB 在线阅读；其他格式可以在详情页下载。</p>
     """,
     ),
]


def make_manual(cache: Path) -> Book:
    def xhtml(title: str, body: str) -> str:
        return (
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<!DOCTYPE html>\n'
            '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN" lang="zh-CN">'
            f"<head><title>{title}</title><link rel=\"stylesheet\" type=\"text/css\" href=\"style.css\"/></head>"
            f"<body><h1>{title}</h1>{body}</body></html>"
        )

    cover_path = make_manual_cover(Path(cache) / "manual-cover.jpg")

    buf = io.BytesIO()
    uid = "urn:uuid:xinghao-library-manual"
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("mimetype", "application/epub+zip", zipfile.ZIP_STORED)
        zf.writestr(
            "META-INF/container.xml",
            '<?xml version="1.0"?><container version="1.0" '
            'xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
            '<rootfiles><rootfile full-path="OEBPS/content.opf" '
            'media-type="application/oebps-package+xml"/></rootfiles></container>',
        )
        zf.writestr("OEBPS/style.css", MANUAL_CSS)
        zf.writestr("OEBPS/cover.xhtml",
                    '<html xmlns="http://www.w3.org/1999/xhtml"><body style="margin:0">'
                    '<img src="cover.jpg" alt="cover" style="width:100%"/></body></html>')
        with open(cover_path, "rb") as fh:
            zf.writestr("OEBPS/cover.jpg", fh.read())

        items, spine, nav = [], [], []
        for i, (slug, title, body) in enumerate(MANUAL_PAGES, start=1):
            zf.writestr(f"OEBPS/{slug}.xhtml", xhtml(title, body))
            items.append(f'<item id="{slug}" href="{slug}.xhtml" media-type="application/xhtml+xml"/>')
            spine.append(f'<itemref idref="{slug}"/>')
            nav.append(f'<li><a href="{slug}.xhtml">{title}</a></li>')

        zf.writestr(
            "OEBPS/nav.xhtml",
            '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">'
            "<head><title>目录</title></head><body><nav epub:type=\"toc\"><ol>"
            + "".join(nav) + "</ol></nav></body></html>",
        )
        zf.writestr(
            "OEBPS/content.opf",
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">'
            '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
            f'<dc:identifier id="bookid">{uid}</dc:identifier>'
            "<dc:title>星皓书房使用手册</dc:title>"
            "<dc:creator>星皓书房</dc:creator>"
            "<dc:language>zh-CN</dc:language>"
            "<dc:publisher>星皓书房</dc:publisher>"
            "<dc:date>2026-10-28</dc:date>"
            "<dc:description>这本小册子介绍星皓书房的自托管应用：书从哪里来、怎么读、划线笔记存在哪里。</dc:description>"
            '<meta property="dcterms:modified">2026-10-28T00:00:00Z</meta>'
            '<meta name="cover" content="cover-img"/>'
            "</metadata><manifest>"
            '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
            '<item id="cover-img" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>'
            '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>'
            '<item id="css" href="style.css" media-type="text/css"/>'
            + "".join(items) +
            "</manifest><spine>" + "".join(spine) + "</spine></package>",
        )

    return Book(
        gid="manual",
        title="星皓书房使用手册",
        author="星皓书房",
        tags=["手册", "本站"],
        rating=10,
        publisher="星皓书房",
        published="2026-10-28",
        language="zho",
        description="这本小册子介绍星皓书房的自托管应用：书从哪里来、怎么读、划线笔记存在哪里。四章，约十分钟读完。",
        epub=buf.getvalue(),
        cover=Image.open(cover_path).convert("RGB"),
    )


def make_manual_cover(path: Path) -> Path:
    width, height = 900, 1350
    img = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(img)
    top, bottom = (30, 32, 38), (12, 13, 16)
    for y in range(height):
        t = y / height
        draw.line([(0, y), (width, y)],
                  fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    for y in range(0, height, 4):
        draw.line([(0, y), (width, y)], fill=(255, 255, 255, 4) if y % 8 else (255, 255, 255, 8))

    def font(size: int) -> ImageFont.FreeTypeFont:
        for name in ("msyh.ttc", "simhei.ttf", "simsun.ttc"):
            p = Path("C:/Windows/Fonts") / name
            if p.exists():
                return ImageFont.truetype(str(p), size)
        return ImageFont.load_default()

    draw.text((90, 110), "星 皓 书 房", font=font(46), fill=(200, 168, 110))
    draw.line([(90, 200), (250, 200)], fill=(200, 168, 110), width=3)
    draw.text((90, 470), "使用", font=font(120), fill=(240, 236, 228))
    draw.text((90, 620), "手册", font=font(120), fill=(240, 236, 228))
    draw.text((90, 830), "Calibre 驱动的个人数字图书馆", font=font(34), fill=(150, 148, 142))
    draw.text((90, 1200), "HAOMING XING", font=font(26), fill=(120, 116, 108))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "JPEG", quality=88)
    return path


# ---------------------------------------------------------------- Calibre 落盘

def author_sort(name: str) -> str:
    parts = [p.strip() for p in name.split(",")]
    return ", ".join(parts) if len(parts) > 1 else name


def title_sort(title: str) -> str:
    return re.sub(r"^(The|A|An)\s+", "", title, flags=re.I)


def slug_dir(title: str) -> str:
    return re.sub(r'[\\/:*?"<>|]', "_", title)


def calibre_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT 'Unknown',
            sort TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            pubdate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            series_index REAL NOT NULL DEFAULT 1.0,
            author_sort TEXT,
            isbn TEXT,
            lccn TEXT,
            path TEXT NOT NULL DEFAULT '',
            flags INTEGER NOT NULL DEFAULT 1,
            uuid TEXT,
            has_cover BOOL DEFAULT 0,
            last_modified TIMESTAMP NOT NULL DEFAULT '2000-01-01 00:00:00+00:00'
        );
        CREATE TABLE authors (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE,
            sort TEXT COLLATE NOCASE,
            link TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE books_authors_link (
            id INTEGER PRIMARY KEY, book INTEGER NOT NULL, author INTEGER NOT NULL,
            UNIQUE(book, author)
        );
        CREATE TABLE data (
            id INTEGER PRIMARY KEY, book INTEGER NOT NULL, format TEXT NOT NULL COLLATE NOCASE,
            uncompressed_size INTEGER NOT NULL, name TEXT NOT NULL, UNIQUE(book, format)
        );
        CREATE TABLE series (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE, sort TEXT COLLATE NOCASE
        );
        CREATE TABLE books_series_link (
            id INTEGER PRIMARY KEY, book INTEGER NOT NULL, series INTEGER NOT NULL, UNIQUE(book, series)
        );
        CREATE TABLE tags (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE, sort TEXT COLLATE NOCASE
        );
        CREATE TABLE books_tags_link (
            id INTEGER PRIMARY KEY, book INTEGER NOT NULL, tag INTEGER NOT NULL, UNIQUE(book, tag)
        );
        CREATE TABLE comments (
            id INTEGER PRIMARY KEY, book INTEGER NOT NULL, text TEXT NOT NULL COLLATE NOCASE, UNIQUE(book)
        );
        CREATE TABLE publishers (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE, sort TEXT COLLATE NOCASE
        );
        CREATE TABLE books_publishers_link (
            id INTEGER PRIMARY KEY, book INTEGER NOT NULL, publisher INTEGER NOT NULL, UNIQUE(book)
        );
        CREATE TABLE identifiers (
            id INTEGER PRIMARY KEY, book INTEGER NOT NULL,
            type TEXT NOT NULL DEFAULT 'isbn' COLLATE NOCASE,
            val TEXT NOT NULL COLLATE NOCASE, UNIQUE(book, type)
        );
        CREATE TABLE ratings (id INTEGER PRIMARY KEY, rating INTEGER CHECK(rating > -1 AND rating < 11));
        CREATE TABLE books_ratings_link (
            id INTEGER PRIMARY KEY, book INTEGER NOT NULL, rating INTEGER NOT NULL, UNIQUE(book, rating)
        );
        CREATE TABLE languages (
            id INTEGER PRIMARY KEY, lang_code TEXT NOT NULL COLLATE NOCASE,
            link TEXT NOT NULL DEFAULT '', UNIQUE(lang_code)
        );
        CREATE TABLE books_languages_link (
            id INTEGER PRIMARY KEY, book INTEGER NOT NULL, lang_code INTEGER NOT NULL,
            item_order INTEGER NOT NULL DEFAULT 0, link TEXT NOT NULL DEFAULT '', UNIQUE(book, lang_code)
        );
        CREATE TABLE preferences (id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, val TEXT NOT NULL);
        CREATE INDEX books_idx ON books(sort COLLATE NOCASE);
        CREATE INDEX authors_idx ON authors(sort COLLATE NOCASE);
        CREATE INDEX books_authors_link_aidx ON books_authors_link(author);
        CREATE INDEX books_authors_link_bidx ON books_authors_link(book);
        """
    )


def build(out: Path) -> None:
    cache = Path(__file__).parent / ".cache"
    cache.mkdir(parents=True, exist_ok=True)

    books = list(GUTENBERG)
    print("下载 Gutenberg 公版书")
    for book in books:
        download(book, cache, refresh=REFRESH)
        book.cover = cover_from_epub(book.epub)
        book.series = series_from_epub(book.epub) or book.series
        if not book.description:
            book.description = ""

    print("生成中文手册")
    books.append(make_manual(cache))

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    conn = sqlite3.connect(out / "metadata.db")
    calibre_schema(conn)

    author_ids: dict[str, int] = {}
    series_ids: dict[str, int] = {}
    tag_ids: dict[str, int] = {}
    publisher_ids: dict[str, int] = {}
    rating_ids: dict[int, int] = {}
    language_ids: dict[str, int] = {}

    for idx, book in enumerate(books, start=1):
        asort = author_sort(book.author)
        rel = f"{slug_dir(asort)}/{slug_dir(book.title)} ({idx})"
        folder = out / rel
        folder.mkdir(parents=True, exist_ok=True)

        filename = f"{slug_dir(book.title)} - {slug_dir(book.author)}"
        (folder / f"{filename}.epub").write_bytes(book.epub)

        if book.cover is not None:
            book.cover.thumbnail((1000, 1500))
            book.cover.save(folder / "cover.jpg", "JPEG", quality=88)

        stamp = f"{TODAY:%Y-%m-%d %H:%M:%S}.000000{TZ}"
        pubdate = f"{book.published} 00:00:00{TZ}"
        conn.execute(
            "INSERT INTO books (id, title, sort, timestamp, pubdate, series_index, author_sort,"
            " path, flags, uuid, has_cover, last_modified) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (idx, book.title, title_sort(book.title), stamp, pubdate, book.series_index,
             asort, rel, 1, str(uuid.uuid4()), int(book.cover is not None), stamp),
        )
        conn.execute(
            "INSERT INTO data (book, format, uncompressed_size, name) VALUES (?,?,?,?)",
            (idx, "EPUB", len(book.epub), filename),
        )

        if book.author not in author_ids:
            cur = conn.execute("INSERT INTO authors (name, sort, link) VALUES (?,?,?)",
                               (book.author, asort, ""))
            author_ids[book.author] = cur.lastrowid
        conn.execute("INSERT INTO books_authors_link (book, author) VALUES (?,?)",
                     (idx, author_ids[book.author]))

        if book.series:
            if book.series not in series_ids:
                cur = conn.execute("INSERT INTO series (name, sort) VALUES (?,?)",
                                   (book.series, book.series))
                series_ids[book.series] = cur.lastrowid
            conn.execute("INSERT INTO books_series_link (book, series) VALUES (?,?)",
                         (idx, series_ids[book.series]))

        for tag in book.tags:
            if tag not in tag_ids:
                cur = conn.execute("INSERT INTO tags (name, sort) VALUES (?,?)",
                                   (tag, tag))
                tag_ids[tag] = cur.lastrowid
            conn.execute("INSERT INTO books_tags_link (book, tag) VALUES (?,?)",
                         (idx, tag_ids[tag]))

        if book.publisher:
            if book.publisher not in publisher_ids:
                cur = conn.execute("INSERT INTO publishers (name, sort) VALUES (?,?)",
                                   (book.publisher, book.publisher))
                publisher_ids[book.publisher] = cur.lastrowid
            conn.execute("INSERT INTO books_publishers_link (book, publisher) VALUES (?,?)",
                         (idx, publisher_ids[book.publisher]))

        if book.rating:
            if book.rating not in rating_ids:
                cur = conn.execute("INSERT INTO ratings (rating) VALUES (?)", (book.rating,))
                rating_ids[book.rating] = cur.lastrowid
            conn.execute("INSERT INTO books_ratings_link (book, rating) VALUES (?,?)",
                         (idx, rating_ids[book.rating]))

        if book.language not in language_ids:
            cur = conn.execute("INSERT INTO languages (lang_code) VALUES (?)", (book.language,))
            language_ids[book.language] = cur.lastrowid
        conn.execute("INSERT INTO books_languages_link (book, lang_code) VALUES (?,?)",
                     (idx, language_ids[book.language]))

        conn.execute("INSERT INTO comments (book, text) VALUES (?,?)",
                     (idx, f"<p>{html.escape(book.description)}</p>" if book.description else ""))

        conn.execute("INSERT INTO identifiers (book, type, val) VALUES (?,?,?)",
                     (idx, "gutenberg", book.gid))

    conn.execute("INSERT INTO preferences (key, val) VALUES ('demo_library', ?)",
                 (json.dumps({"built_at": TODAY.isoformat(), "count": len(books)}),))
    conn.commit()
    conn.close()

    size_mb = sum(f.stat().st_size for f in out.rglob("*") if f.is_file()) // 1024 // 1024
    print(f"\n完成：{out}  ·  {len(books)} 本  ·  {size_mb} MB")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="demo-library")
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    REFRESH = args.refresh
    build(Path(args.out))
