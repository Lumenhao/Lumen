"""Calibre 书库的只读访问。

只依赖 Calibre 长期稳定的元数据表；缺失的表按空处理，旧库也能打开。
任何路径都先解析再校验是否位于库根目录内。
"""

from __future__ import annotations

import posixpath
import re
import sqlite3
import zipfile
from pathlib import Path
from typing import Any
from urllib.parse import quote
from xml.etree import ElementTree as ET

OPF = "{http://www.idpf.org/2007/opf}"
NCX = "{http://www.daisy.org/z3986/2005/ncx/}"
CONTAINER = "{urn:oasis:names:tc:opendocument:xmlns:container}"


class LibraryError(RuntimeError):
    pass


def _plain(html_text: str | None) -> str:
    if not html_text:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", html_text, flags=re.I)
    text = re.sub(r"</p>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def _split(value: str | None) -> list[str]:
    return [v for v in (value or "").split("||") if v]


def _date(value: str | None) -> str:
    return (value or "")[:10]


class CalibreLibrary:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.db = self.root / "metadata.db"
        if not self.db.exists():
            raise LibraryError(f"没有找到 Calibre 书库：{self.db}")

    # ------------------------------------------------------------ 基础

    def _connect(self) -> sqlite3.Connection:
        uri = "file:" + quote(str(self.db).replace("\\", "/"), safe="/:") + "?mode=ro"
        conn = sqlite3.connect(uri, uri=True, timeout=5)
        conn.row_factory = sqlite3.Row
        return conn

    def _tables(self) -> set[str]:
        with self._connect() as conn:
            rows = conn.execute("select name from sqlite_master where type='table'").fetchall()
        return {r["name"] for r in rows}

    def stats(self) -> dict[str, Any]:
        tables = self._tables()
        with self._connect() as conn:
            books = conn.execute("select count(*) from books").fetchone()[0]
            authors = conn.execute("select count(*) from authors").fetchone()[0] if "authors" in tables else 0
            formats = conn.execute("select count(distinct format) from data").fetchone()[0] if "data" in tables else 0
        return {"books": books, "authors": authors, "formats": formats, "path": str(self.root)}

    def _safe_path(self, relative: str) -> Path | None:
        candidate = (self.root / relative.replace("\\", "/")).resolve()
        try:
            candidate.relative_to(self.root)
        except ValueError:
            return None
        return candidate

    # ------------------------------------------------------------ 列表

    _SORTS = {
        "recent": "timestamp desc, id desc",
        "title": "sort collate nocase asc, id asc",
        "author": "author_sort collate nocase asc, sort collate nocase asc",
        "pubdate": "pubdate desc, sort collate nocase asc",
        "rating": "rating is null, rating desc, sort collate nocase asc",
        "series": "series is null, series collate nocase asc, series_index asc, sort asc",
    }

    def _select(self) -> str:
        return """
            select b.id, b.title, b.sort, b.timestamp, b.pubdate, b.series_index,
                   b.path, b.has_cover, b.author_sort,
                   (select text from comments c where c.book = b.id) as comments,
                   (select group_concat(a.name, '||') from books_authors_link l
                      join authors a on a.id = l.author where l.book = b.id) as authors,
                   (select group_concat(t.name, '||') from books_tags_link l
                      join tags t on t.id = l.tag where l.book = b.id) as tags,
                   (select s.name from books_series_link l join series s on s.id = l.series
                      where l.book = b.id limit 1) as series,
                   (select p.name from books_publishers_link l join publishers p on p.id = l.publisher
                      where l.book = b.id limit 1) as publisher,
                   (select r.rating from books_ratings_link l join ratings r on r.id = l.rating
                      where l.book = b.id limit 1) as rating,
                   (select group_concat(d.format, '||') from data d where d.book = b.id) as formats,
                   (select group_concat(lg.lang_code, '||') from books_languages_link l
                      join languages lg on lg.id = l.lang_code where l.book = b.id) as languages,
                   (select val from identifiers i where i.book = b.id and i.type = 'isbn' limit 1) as isbn
            from books b
        """

    def _where(self, q: str, author: str, tag: str, series: str, language: str) -> tuple[str, list[Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        for term in (q or "").split():
            like = f"%{term}%"
            clauses.append(
                "(b.title like ? or b.author_sort like ?"
                " or exists (select 1 from books_authors_link l join authors a on a.id = l.author"
                "             where l.book = b.id and a.name like ?)"
                " or exists (select 1 from books_tags_link l join tags t on t.id = l.tag"
                "             where l.book = b.id and t.name like ?)"
                " or exists (select 1 from books_series_link l join series s on s.id = l.series"
                "             where l.book = b.id and s.name like ?)"
                " or exists (select 1 from comments c where c.book = b.id and c.text like ?))"
            )
            params.extend([like] * 6)
        if author:
            clauses.append("exists (select 1 from books_authors_link l join authors a on a.id = l.author"
                           " where l.book = b.id and a.name = ?)")
            params.append(author)
        if tag:
            clauses.append("exists (select 1 from books_tags_link l join tags t on t.id = l.tag"
                           " where l.book = b.id and t.name = ?)")
            params.append(tag)
        if series:
            clauses.append("exists (select 1 from books_series_link l join series s on s.id = l.series"
                           " where l.book = b.id and s.name = ?)")
            params.append(series)
        if language:
            clauses.append("exists (select 1 from books_languages_link l join languages lg on lg.id = l.lang_code"
                           " where l.book = b.id and lg.lang_code = ?)")
            params.append(language)
        return (" where " + " and ".join(clauses)) if clauses else "", params

    def list_books(
        self,
        q: str = "",
        author: str = "",
        tag: str = "",
        series: str = "",
        language: str = "",
        sort: str = "recent",
        page: int = 1,
        page_size: int = 24,
    ) -> dict[str, Any]:
        page = max(1, page)
        page_size = min(100, max(1, page_size))
        where, params = self._where(q, author, tag, series, language)
        order = self._SORTS.get(sort, self._SORTS["recent"])
        offset = (page - 1) * page_size

        sql = (
            "select * from ("
            + self._select()
            + where
            + f") order by {order} limit ? offset ?"
        )
        with self._connect() as conn:
            total = conn.execute("select count(*) from books b" + where, params).fetchone()[0]
            rows = conn.execute(sql, [*params, page_size, offset]).fetchall()

        items = [self._serialize(r) for r in rows]
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": max(1, (total + page_size - 1) // page_size),
        }

    def facets(self) -> dict[str, list[dict[str, Any]]]:
        def group(sql: str) -> list[dict[str, Any]]:
            try:
                with self._connect() as conn:
                    return [{"name": r[0], "count": r[1]} for r in conn.execute(sql)]
            except sqlite3.Error:
                return []

        return {
            "authors": group("select a.name, count(*) c from authors a"
                             " join books_authors_link l on l.author = a.id"
                             " group by a.id order by c desc, a.name limit 120"),
            "tags": group("select t.name, count(*) c from tags t"
                          " join books_tags_link l on l.tag = t.id"
                          " group by t.id order by c desc, t.name limit 120"),
            "series": group("select s.name, count(*) c from series s"
                            " join books_series_link l on l.series = s.id"
                            " group by s.id order by s.name limit 120"),
            "languages": group("select lg.lang_code, count(*) c from languages lg"
                               " join books_languages_link l on l.lang_code = lg.id"
                               " group by lg.id order by c desc"),
        }

    # ------------------------------------------------------------ 单本

    def _serialize(self, row: sqlite3.Row) -> dict[str, Any]:
        rating = row["rating"] or 0
        return {
            "id": row["id"],
            "title": row["title"],
            "authors": _split(row["authors"]),
            "series": row["series"],
            "series_index": row["series_index"],
            "tags": _split(row["tags"]),
            "publisher": row["publisher"],
            "rating": round(rating / 2) if rating else 0,
            "pubdate": _date(row["pubdate"]),
            "added": _date(row["timestamp"]),
            "formats": [f.lower() for f in _split(row["formats"])],
            "languages": _split(row["languages"]),
            "isbn": row["isbn"],
            "has_cover": bool(row["has_cover"]),
            "description": _plain(row["comments"]),
        }

    def get_book(self, book_id: int) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(self._select() + " where b.id = ?", (book_id,)).fetchone()
            if row is None:
                return None
            book = self._serialize(row)
            book["files"] = [
                {"format": r["format"].lower(), "name": r["name"], "size": r["uncompressed_size"]}
                for r in conn.execute("select format, name, uncompressed_size from data where book = ?",
                                     (book_id,))
            ]
        epub = self.book_file(book_id, "epub")
        if epub:
            book["toc"] = self.epub_toc(epub)
        else:
            book["toc"] = []
        return book

    def file_entry(self, book_id: int, fmt: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "select format, name, uncompressed_size from data where book = ? and lower(format) = ?",
                (book_id, fmt.lower()),
            ).fetchone()
        if row is None:
            return None
        path = self._safe_path(posixpath.join(self._book_rel(book_id) or "", f"{row['name']}.{fmt.lower()}"))
        if path is None or not path.is_file():
            return None
        return {"path": path, "format": fmt.lower(), "size": row["uncompressed_size"], "name": row["name"]}

    def books_by_ids(self, ids: list[int]) -> dict[int, dict[str, Any]]:
        if not ids:
            return {}
        marks = ",".join("?" * len(ids))
        with self._connect() as conn:
            rows = conn.execute(self._select() + f" where b.id in ({marks})", ids).fetchall()
        return {r["id"]: self._serialize(r) for r in rows}

    def _book_rel(self, book_id: int) -> str | None:
        with self._connect() as conn:
            row = conn.execute("select path from books where id = ?", (book_id,)).fetchone()
        return row["path"] if row else None

    def book_file(self, book_id: int, fmt: str) -> Path | None:
        entry = self.file_entry(book_id, fmt)
        return entry["path"] if entry else None

    def cover(self, book_id: int) -> Path | None:
        rel = self._book_rel(book_id)
        if not rel:
            return None
        for name in ("cover.jpg", "cover.jpeg", "cover.png", "cover.webp"):
            path = self._safe_path(posixpath.join(rel, name))
            if path and path.is_file():
                return path
        return None

    # ------------------------------------------------------------ EPUB 目录

    def epub_toc(self, path: Path, limit: int = 400) -> list[dict[str, Any]]:
        try:
            with zipfile.ZipFile(path) as zf:
                container = ET.fromstring(zf.read("META-INF/container.xml"))
                rootfile = container.find(f".//{CONTAINER}rootfile")
                if rootfile is None:
                    return []
                opf_path = rootfile.get("full-path", "")
                base = posixpath.dirname(opf_path)
                opf = ET.fromstring(zf.read(opf_path))

                manifest: dict[str, ET.Element] = {}
                nav_href = None
                for item in opf.iter(f"{OPF}item"):
                    manifest[item.get("id", "")] = item
                    if "nav" in (item.get("properties") or "").split():
                        nav_href = item.get("href")

                if nav_href:
                    doc = ET.fromstring(zf.read(posixpath.join(base, nav_href)))
                    navs = [n for n in doc.iter() if n.tag.endswith("}nav")]
                    chosen = None
                    for nav in navs:
                        kind = nav.get("{http://www.idpf.org/2007/ops}type") or nav.get("type") or ""
                        if "toc" in kind.split():
                            chosen = nav
                            break
                    chosen = chosen or (navs[0] if navs else None)
                    if chosen is not None:
                        return self._nav_items(chosen, limit)

                spine = opf.find(f"{OPF}spine")
                ncx_id = spine.get("toc") if spine is not None else None
                if ncx_id and ncx_id in manifest:
                    ncx_path = posixpath.join(base, manifest[ncx_id].get("href", ""))
                    doc = ET.fromstring(zf.read(ncx_path))
                    items = []
                    for point in doc.iter(f"{NCX}navPoint"):
                        label = point.find(f".//{NCX}text")
                        content = point.find(f"{NCX}content")
                        if label is not None and content is not None:
                            items.append({"title": (label.text or "").strip(),
                                          "href": content.get("src", ""), "level": 0})
                            if len(items) >= limit:
                                break
                    return items
        except Exception:
            return []
        return []

    @staticmethod
    def _nav_items(nav: ET.Element, limit: int) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []

        def walk(node: ET.Element, level: int) -> None:
            for li in node:
                if not li.tag.endswith("li") or len(out) >= limit:
                    continue
                anchor = next((c for c in li if c.tag.endswith("a")), None)
                if anchor is not None:
                    title = "".join(anchor.itertext()).strip()
                    if title:
                        out.append({"title": title, "href": anchor.get("href", ""), "level": level})
                for sub in li:
                    if sub.tag.endswith("ol"):
                        walk(sub, level + 1)

        for child in nav:
            if child.tag.endswith("ol"):
                walk(child, 0)
        return out
