"""Lumen · 星皓书房 · 自托管应用入口。

python -m app.main
"""

from __future__ import annotations

import base64
import binascii
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from pydantic import BaseModel, Field
from starlette.middleware.base import BaseHTTPMiddleware

from .calibre import CalibreLibrary, LibraryError
from .config import settings
from .store import Store

STATIC = Path(__file__).resolve().parent / "static"

MEDIA_TYPES = {
    "epub": "application/epub+zip",
    "pdf": "application/pdf",
    "mobi": "application/x-mobipocket-ebook",
    "azw": "application/vnd.amazon.ebook",
    "azw3": "application/vnd.amazon.ebook",
    "txt": "text/plain; charset=utf-8",
    "cbz": "application/vnd.comicbook+zip",
    "cbr": "application/vnd.comicbook-rar",
    "fb2": "application/x-fictionbook+xml",
    "rtf": "application/rtf",
    "htmlz": "application/zip",
    "lit": "application/x-ms-reader",
    "pdb": "application/vnd.palm",
    "djvu": "image/vnd.djvu",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


app = FastAPI(title="Lumen · 星皓书房", docs_url="/api/docs", openapi_url="/api/openapi.json")

try:
    library = CalibreLibrary(settings.library_path)
    library_error: str | None = None
    library_error_path: str | None = None
except LibraryError as exc:
    library = None  # type: ignore[assignment]
    library_error = "library_missing"
    library_error_path = str(exc)

store = Store(settings.data_dir / "library.db")


def need_library() -> CalibreLibrary:
    if library is None:
        raise HTTPException(status_code=503, detail="library_unavailable")
    return library


# ---------------------------------------------------------------- 中间件

class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if settings.password and not request.url.path.startswith("/api/docs"):
            header = request.headers.get("authorization", "")
            ok = False
            if header.startswith("Basic "):
                try:
                    raw = base64.b64decode(header[6:]).decode("utf-8")
                    _, _, given = raw.partition(":")
                    ok = given == settings.password
                except (binascii.Error, UnicodeDecodeError):
                    ok = False
            if not ok:
                return Response(
                    status_code=401,
                    headers={"WWW-Authenticate": 'Basic realm="Lumen", charset="UTF-8"'},
                )
        response = await call_next(request)
        response.headers["x-content-type-options"] = "nosniff"
        response.headers["referrer-policy"] = "same-origin"
        return response


app.add_middleware(SecurityMiddleware)


# ---------------------------------------------------------------- 页面

def resolve_locale(request: Request) -> str:
    """LOCALE 固定语言；auto 时按 Accept-Language 选，认不出就用英文。"""
    if settings.locale != "auto":
        return settings.locale
    header = request.headers.get("accept-language", "")
    if not header:
        return "zh"
    for part in header.split(","):
        tag = part.split(";")[0].strip().lower()
        if tag.startswith("zh"):
            return "zh"
        if tag.startswith("en"):
            return "en"
    return "en"


def page(name: str, request: Request) -> HTMLResponse:
    locale = resolve_locale(request)
    html = (STATIC / name).read_text(encoding="utf-8")
    html = html.replace("__LUMEN_LOCALE__", locale)
    html = html.replace("__LUMEN_LANG__", "zh-CN" if locale == "zh" else "en")
    return HTMLResponse(html, headers={"cache-control": "no-cache"})


@app.get("/", include_in_schema=False)
def index(request: Request) -> HTMLResponse:
    return page("index.html", request)


@app.get("/book/{book_id}", include_in_schema=False)
def book_page(book_id: int, request: Request) -> HTMLResponse:
    return page("index.html", request)


@app.get("/read/{book_id}", include_in_schema=False)
def reader_page(book_id: int, request: Request) -> HTMLResponse:
    return page("reader.html", request)


@app.get("/favicon.svg", include_in_schema=False)
def favicon() -> Response:
    return FileResponse(STATIC / "favicon.svg", media_type="image/svg+xml")


# ---------------------------------------------------------------- 配置与书库

@app.get("/api/config")
def config(request: Request) -> dict[str, Any]:
    stats = library.stats() if library else {"books": 0, "authors": 0, "formats": 0, "path": ""}
    return {
        "site_name": settings.site_name,
        "demo": settings.is_demo,
        "auth": bool(settings.password),
        "locale": resolve_locale(request),
        "library": stats,
        "error": library_error,
        "error_path": library_error_path,
    }


@app.get("/api/library")
def library_list(
    q: str = "",
    author: str = "",
    tag: str = "",
    series: str = "",
    language: str = "",
    sort: str = "recent",
    page: int = 1,
    page_size: int = 24,
    facets: int = 1,
) -> dict[str, Any]:
    lib = need_library()
    data = lib.list_books(q=q.strip(), author=author, tag=tag, series=series,
                          language=language, sort=sort, page=page, page_size=page_size)
    progress = store.progress_map([item["id"] for item in data["items"]])
    for item in data["items"]:
        p = progress.get(item["id"])
        item["progress"] = {"percent": p["percent"], "updated_at": p["updated_at"]} if p else None
    if facets:
        data["facets"] = lib.facets()
    return data


@app.get("/api/reading")
def reading(limit: int = 12) -> dict[str, Any]:
    lib = need_library()
    recent = store.recent(limit)
    books = lib.books_by_ids([r["book_id"] for r in recent])
    items = []
    for entry in recent:
        book = books.get(entry["book_id"])
        if book:
            book["progress"] = {"percent": entry["percent"], "updated_at": entry["updated_at"]}
            items.append(book)
    return {"items": items}


@app.get("/api/books/{book_id}")
def book_detail(book_id: int) -> dict[str, Any]:
    book = need_library().get_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="book_not_found")
    return {"book": book, "progress": store.get_progress(book_id)}


@app.get("/api/books/{book_id}/session")
def reader_session(book_id: int) -> dict[str, Any]:
    lib = need_library()
    book = lib.get_book(book_id)
    if not book:
        raise HTTPException(status_code=404, detail="book_not_found")
    book.pop("toc", None)
    return {
        "book": book,
        "progress": store.get_progress(book_id),
        "bookmarks": store.bookmarks(book_id),
        "annotations": store.annotations(book_id),
    }


@app.get("/api/books/{book_id}/cover")
def cover(book_id: int) -> FileResponse:
    path = need_library().cover(book_id)
    if not path:
        raise HTTPException(status_code=404, detail="cover_not_found")
    return FileResponse(path, headers={"cache-control": "public, max-age=86400"})


@app.get("/api/books/{book_id}/file/{fmt}")
def book_file(book_id: int, fmt: str, inline: int = 0):
    entry = need_library().file_entry(book_id, fmt)
    if not entry:
        raise HTTPException(status_code=404, detail="format_not_found")
    fmt = entry["format"]
    disposition = "inline" if (inline or fmt in {"epub", "pdf"}) else "attachment"
    filename = f"{entry['name']}.{fmt}"
    return FileResponse(
        entry["path"],
        media_type=MEDIA_TYPES.get(fmt, "application/octet-stream"),
        filename=filename,
        content_disposition_type=disposition,
    )


# ---------------------------------------------------------------- 进度 / 书签 / 笔记

class ProgressIn(BaseModel):
    cfi: str | None = None
    percent: float = Field(default=0.0, ge=0.0, le=1.0)
    page: int | None = None


class BookmarkIn(BaseModel):
    cfi: str = Field(min_length=1)
    label: str = ""
    percent: float = Field(default=0.0, ge=0.0, le=1.0)


class AnnotationIn(BaseModel):
    cfi: str = Field(min_length=1)
    quote: str = ""
    note: str = ""
    color: str = "yellow"
    chapter: str = ""
    percent: float = Field(default=0.0, ge=0.0, le=1.0)
    type: str = "highlight"


class AnnotationPatch(BaseModel):
    note: str | None = None
    color: str | None = None


@app.get("/api/books/{book_id}/progress")
def get_progress(book_id: int) -> dict[str, Any]:
    return {"progress": store.get_progress(book_id)}


@app.post("/api/books/{book_id}/progress")
def post_progress(book_id: int, payload: ProgressIn) -> dict[str, Any]:
    return {"progress": store.save_progress(book_id, payload.cfi, payload.percent, payload.page)}


@app.get("/api/books/{book_id}/bookmarks")
def get_bookmarks(book_id: int) -> dict[str, Any]:
    return {"items": store.bookmarks(book_id)}


@app.post("/api/books/{book_id}/bookmarks")
def post_bookmark(book_id: int, payload: BookmarkIn) -> dict[str, Any]:
    return {"bookmark": store.add_bookmark(book_id, payload.cfi, payload.label, payload.percent)}


@app.delete("/api/bookmarks/{bookmark_id}")
def remove_bookmark(bookmark_id: int) -> dict[str, bool]:
    if not store.delete_bookmark(bookmark_id):
        raise HTTPException(status_code=404, detail="bookmark_not_found")
    return {"deleted": True}


@app.get("/api/books/{book_id}/annotations")
def get_annotations(book_id: int) -> dict[str, Any]:
    return {"items": store.annotations(book_id)}


@app.post("/api/books/{book_id}/annotations")
def post_annotation(book_id: int, payload: AnnotationIn) -> dict[str, Any]:
    return {
        "annotation": store.add_annotation(
            book_id, payload.cfi, payload.quote, payload.note, payload.color,
            payload.chapter, payload.percent, payload.type,
        )
    }


@app.patch("/api/annotations/{annotation_id}")
def patch_annotation(annotation_id: int, payload: AnnotationPatch) -> dict[str, Any]:
    row = store.update_annotation(annotation_id, payload.note, payload.color)
    if row is None:
        raise HTTPException(status_code=404, detail="note_not_found")
    return {"annotation": row}


@app.delete("/api/annotations/{annotation_id}")
def remove_annotation(annotation_id: int) -> dict[str, bool]:
    if not store.delete_annotation(annotation_id):
        raise HTTPException(status_code=404, detail="note_not_found")
    return {"deleted": True}


# ---------------------------------------------------------------- 静态资源

from fastapi.staticfiles import StaticFiles  # noqa: E402

app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.exception_handler(LibraryError)
async def library_error_handler(_: Request, exc: LibraryError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc)})


def main() -> None:
    import uvicorn

    if library_error:
        print(f"[Lumen] 书库不可用：{library_error}")
    print(f"[Lumen] 书库：{settings.library_path}")
    print(f"[Lumen] 数据：{settings.data_dir}")
    print(f"[Lumen] http://{settings.host}:{settings.port}")
    uvicorn.run(app, host=settings.host, port=settings.port, log_level="info")


if __name__ == "__main__":
    main()
