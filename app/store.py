"""应用私有数据：阅读进度、书签、划线笔记。

与 Calibre 库完全分离，单文件 SQLite，复制即备份。
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS progress (
    book_id    INTEGER PRIMARY KEY,
    cfi        TEXT,
    percent    REAL NOT NULL DEFAULT 0,
    page       INTEGER,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bookmarks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id    INTEGER NOT NULL,
    cfi        TEXT NOT NULL,
    label      TEXT NOT NULL DEFAULT '',
    percent    REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_book ON bookmarks(book_id, created_at);
CREATE TABLE IF NOT EXISTS annotations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id    INTEGER NOT NULL,
    type       TEXT NOT NULL DEFAULT 'highlight',
    cfi        TEXT NOT NULL,
    quote      TEXT NOT NULL DEFAULT '',
    note       TEXT NOT NULL DEFAULT '',
    color      TEXT NOT NULL DEFAULT 'yellow',
    chapter    TEXT NOT NULL DEFAULT '',
    percent    REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_annotations_book ON annotations(book_id, created_at);
"""


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _row(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


class Store:
    def __init__(self, path: Path) -> None:
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute("pragma journal_mode=wal")
            conn.executescript(SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        return conn

    # ------------------------------------------------------------ 进度

    def get_progress(self, book_id: int) -> dict[str, Any] | None:
        with self._connect() as conn:
            return _row(conn.execute("select * from progress where book_id = ?", (book_id,)).fetchone())

    def progress_map(self, book_ids: list[int]) -> dict[int, dict[str, Any]]:
        if not book_ids:
            return {}
        marks = ",".join("?" * len(book_ids))
        with self._connect() as conn:
            rows = conn.execute(f"select * from progress where book_id in ({marks})", book_ids).fetchall()
        return {r["book_id"]: dict(r) for r in rows}

    def save_progress(self, book_id: int, cfi: str | None, percent: float, page: int | None) -> dict[str, Any]:
        stamp = now()
        with self._connect() as conn:
            conn.execute(
                "insert into progress (book_id, cfi, percent, page, updated_at) values (?,?,?,?,?)"
                " on conflict(book_id) do update set cfi=excluded.cfi, percent=excluded.percent,"
                " page=excluded.page, updated_at=excluded.updated_at",
                (book_id, cfi, max(0.0, min(1.0, percent or 0.0)), page, stamp),
            )
        return {"book_id": book_id, "cfi": cfi, "percent": percent, "page": page, "updated_at": stamp}

    def recent(self, limit: int = 12) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "select * from progress order by updated_at desc limit ?", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]

    # ------------------------------------------------------------ 书签

    def bookmarks(self, book_id: int) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "select * from bookmarks where book_id = ? order by percent asc, id asc", (book_id,)
            ).fetchall()
        return [dict(r) for r in rows]

    def add_bookmark(self, book_id: int, cfi: str, label: str, percent: float) -> dict[str, Any]:
        with self._connect() as conn:
            cur = conn.execute(
                "insert into bookmarks (book_id, cfi, label, percent, created_at) values (?,?,?,?,?)",
                (book_id, cfi, label, percent, now()),
            )
            row = conn.execute("select * from bookmarks where id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)

    def delete_bookmark(self, bookmark_id: int) -> bool:
        with self._connect() as conn:
            cur = conn.execute("delete from bookmarks where id = ?", (bookmark_id,))
        return cur.rowcount > 0

    # ------------------------------------------------------------ 笔记

    def annotations(self, book_id: int) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "select * from annotations where book_id = ? order by percent asc, id asc", (book_id,)
            ).fetchall()
        return [dict(r) for r in rows]

    def add_annotation(
        self,
        book_id: int,
        cfi: str,
        quote: str,
        note: str = "",
        color: str = "yellow",
        chapter: str = "",
        percent: float = 0.0,
        kind: str = "highlight",
    ) -> dict[str, Any]:
        stamp = now()
        with self._connect() as conn:
            cur = conn.execute(
                "insert into annotations (book_id, type, cfi, quote, note, color, chapter, percent,"
                " created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?)",
                (book_id, kind, cfi, quote, note, color, chapter, percent, stamp, stamp),
            )
            row = conn.execute("select * from annotations where id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)

    def update_annotation(self, annotation_id: int, note: str | None, color: str | None) -> dict[str, Any] | None:
        fields, params = [], []
        if note is not None:
            fields.append("note = ?")
            params.append(note)
        if color is not None:
            fields.append("color = ?")
            params.append(color)
        if not fields:
            with self._connect() as conn:
                return _row(conn.execute("select * from annotations where id = ?", (annotation_id,)).fetchone())
        fields.append("updated_at = ?")
        params.append(now())
        params.append(annotation_id)
        with self._connect() as conn:
            conn.execute(f"update annotations set {', '.join(fields)} where id = ?", params)
            return _row(conn.execute("select * from annotations where id = ?", (annotation_id,)).fetchone())

    def delete_annotation(self, annotation_id: int) -> bool:
        with self._connect() as conn:
            cur = conn.execute("delete from annotations where id = ?", (annotation_id,))
        return cur.rowcount > 0
