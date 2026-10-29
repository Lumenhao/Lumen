<div align="center">

# Lumen

**星皓书房 — your library, lit up as a private star map.**

A self-hosted digital library that reads your Calibre collection in place,<br>
and hands it a reading experience worth staying in.

[English](README.md) · [简体中文](README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-3776AB.svg)](https://www.python.org/)
[![Docker](https://img.shields.io/badge/deploy-docker-2496ED.svg)](docker-compose.yml)
[![Calibre](https://img.shields.io/badge/library-calibre-e9c894.svg)](https://calibre-ebook.com/)

</div>

---

Calibre is very good at keeping a library. It was never meant to be the place where you *read* it.

Lumen points at the Calibre library you already own, reads it without touching it, and puts a quiet, well-set reading room on top: four reading themes, real pagination, highlights and notes that survive a browser restart. No import step, no duplicate library, no metadata rewritten behind Calibre's back.

```bash
git clone https://github.com/Lumenhao/Lumen.git && cd Lumen
docker compose up -d          # → http://localhost:8080
```

![Lumen library](docs/assets/library.png)

## Why Lumen

Self-hosted libraries usually solve *management*, not *reading* — and the good readers (Koodo Reader, Readest) want your books imported into their own store all over again. Lumen joins the two halves:

- **Data plane.** Lumen reads Calibre's `metadata.db` and book files directly. Calibre Desktop remains the only writer; the web app has no code path that can modify your library.
- **Reading plane.** The EPUB reader is rebuilt around Koodo's information architecture: a table-of-contents drawer, a dedicated typography panel, four themes, four-colour highlights, side notes, full-text search, keyboard and touch navigation.
- **Memory plane.** Progress, bookmarks, highlights and notes live in the app's own SQLite file. Change browser, change machine, keep reading where you stopped.
- **Deployment plane.** One Python process, a zero-build frontend, one container. `docker compose up` on a NAS, a VPS, or the mini PC under your desk.

Lumen is for the person who already has a Calibre library, wants to open it from any device at home, and cares how the page looks.

## Features

### Shelf

| | |
|---|---|
| **Cover wall** | Calibre covers, plus generated gradient covers for books that have none |
| **Search** | Title, author, series, tags and description in one field |
| **Filters** | Author, tag, series and language, combinable |
| **Sorting** | Recently added, title, author, published date, rating |
| **Continue reading** | The last few books you opened, one click back to the exact position |

### Reader

| | |
|---|---|
| **Layout** | Single-column, two-column, and scrolling modes, responsive to the window |
| **Typography** | Typeface, size, line height, margins and alignment; applied live and remembered |
| **Themes** | Paper, White, Green, Night — independent of the site theme |
| **Navigation** | Nested table of contents, draggable progress bar, page and percentage readouts |
| **Highlights** | Select to highlight in four colours, attach a note, manage everything in the side panel, click to jump back |
| **Bookmarks** | Save the current position with its chapter name; jump or delete from the side panel |
| **Search** | Full-book text search with chapter and context, click to locate |
| **Input** | Keyboard (← → Space Esc), swipe, and tap zones |
| **Progress** | Debounced writes; an exact CFI restore after reload or on another device |

### Data & deployment

- **Calibre stays read-only.** Only long-stable metadata tables are used; missing tables degrade gracefully.
- **Your own database.** Three tables — `progress`, `bookmarks`, `annotations` — in one file you can copy.
- **Private by default.** No accounts, no telemetry, no outbound requests. Optional HTTP Basic password for exposure beyond localhost.
- **Boring to run.** One container, no Node, no Nginx, no Redis; a built-in health check; the library mounted `:ro`.
- **Bilingual by default.** The interface ships in Chinese and English, follows the browser's `Accept-Language`, and can be pinned with `LOCALE=zh` or `LOCALE=en`.
- **Demo included.** A small public-domain Calibre library ships in the repo, so the interface is never empty on first run.

## Name & Chinese origin

**星皓书房** (*xīng hào shū fáng*) is the Chinese name, and it reads character by character:

| Character | Reading | Meaning |
|---|---|---|
| 星 | xīng | star — the collection, scattered across a shelf |
| 皓 | hào | bright, luminous — also the middle character of the author's given name, 皓鸣 |
| 书房 | shū fáng | a study, the room where one reads |

Together: *a study lit by stars* — a private reading room in which every book is a point of light.

**Lumen** is the English name. In Latin it means *light*; in physics it is the SI unit of luminous flux, the total light a source gives off. It carries the same idea as 皓, shares its opening letters with the author's handle [@Lumenhao](https://github.com/Lumenhao), and describes the job: Lumen does not collect books, it lights them up.

## Quick start

One codebase, two editions. Pick the one that matches the machine you will run it on.

| | Docker edition | Python edition |
|---|---|---|
| **Needs** | Docker with Compose | Python 3.11+ |
| **Best for** | NAS, VPS, an always-on box | A laptop or desktop you already use |
| **Start** | `docker compose up -d` | double-click `start.bat`, or `bash start.sh` |
| **Data** | named volume `library-data` | `data/` inside the project folder |
| **Update** | `git pull && docker compose up -d --build` | `git pull`, then relaunch |

Both editions read the same `.env` at the repository root, so the library path is set once and switching between them costs nothing.

### Docker edition

```bash
git clone https://github.com/Lumenhao/Lumen.git
cd Lumen

# Point at your Calibre library; omit this line to use the bundled demo library
echo "CALIBRE_PATH=D:/Calibre Library" > .env

docker compose up -d
```

Open <http://localhost:8080>. `CALIBRE_PATH` accepts Windows drive paths (`D:/Calibre Library`) and POSIX paths (`/mnt/books/Calibre`). To switch libraries, edit `.env` and run `docker compose up -d` again.

### Python edition

```bash
git clone https://github.com/Lumenhao/Lumen.git
cd Lumen

echo "CALIBRE_PATH=D:/Calibre Library" > .env   # optional, same file as above
```

- **Windows** — double-click `start.bat`.
- **macOS / Linux** — run `bash start.sh`.

The launcher creates `.venv`, installs the two dependencies, starts the server and opens the browser. Nothing is installed globally; delete `.venv/` to undo.

Manual equivalent, if you prefer a shell:

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r app/requirements.txt
python -m app.main
```

Listens on `127.0.0.1:8080` by default. Set `HOST=0.0.0.0` in `.env` to reach it from other devices on your network.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `LIBRARY_PATH` | `demo-library` | Calibre library root (the directory holding `metadata.db`); `CALIBRE_PATH` is accepted as an alias in `.env` |
| `DATA_DIR` | `data` | App data directory (progress, bookmarks, notes) |
| `HOST` | `127.0.0.1` | Bind address (`0.0.0.0` inside the container) |
| `PORT` | `8080` | Listen port |
| `SITE_NAME` | `星皓书房` | Title shown in the interface |
| `LOCALE` | `auto` | Interface language: `auto` follows `Accept-Language`, or pin it with `zh` / `en` |
| `LIBRARY_PASSWORD` | empty | When set, requires HTTP Basic authentication |

`CALIBRE_PATH` is what Compose mounts at `/library`; the Python edition reads the same value as its library path.

## Connecting your Calibre library

1. In Calibre Desktop, check **Preferences → Change Calibre library → Current library** and note the folder.
2. It should contain `metadata.db` plus one `Author/Title (id)/` folder per book.
3. Point `LIBRARY_PATH` (or the compose mount) at that folder.

Lumen only reads it — it never adds, moves or rewrites a file. Add books in Calibre as usual; refresh the page and they appear.

> No library yet? The repo ships `demo-library/`, generated from [public-domain titles](docs/demo-library.md). Regenerate it with `python tools/build_demo_library.py`.

## Data & privacy

| Data | Where it lives | Backup |
|---|---|---|
| Books and metadata | Your Calibre folder | Whatever Calibre is already doing |
| Progress, bookmarks, notes | `DATA_DIR/library.db` | Copy that one file |
| Reader preferences | Browser `localStorage` | Not needed |

No analytics, no crash reporting, no calls home. The only outbound request is a link you yourself open from inside a book.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Python · FastAPI · uvicorn | Async file streaming, OpenAPI for free |
| Library | Calibre `metadata.db` (read-only SQLite) | Zero migration |
| App data | SQLite | One file, nothing to operate |
| Frontend | Native ES modules + hand-written CSS | No build step; edit and reload |
| Reading engine | [epub.js](https://github.com/futurepress/epub.js) | Pagination, CFI, themes, highlights |
| Delivery | Docker Compose | NAS and VPS alike |

Design constraints, data model and API contracts: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Project layout

```
lumen/
├── app/                      # The self-hosted application
│   ├── main.py               # FastAPI entry point and routes
│   ├── calibre.py            # Read-only access to metadata.db
│   ├── store.py              # App SQLite: progress / bookmarks / annotations
│   ├── config.py             # Environment variables
│   └── static/               # Frontend (no build step)
│       ├── index.html        # Shelf and book detail
│       ├── reader.html       # Reader
│       ├── css/              # Design system
│       ├── js/               # api / library / reader
│       └── vendor/           # epub.js
├── demo-library/             # Public-domain Calibre library for first run
├── tools/build_demo_library.py
├── content/  layouts/  assets/  static/  themes/   # Hugo site (the landing page)
├── docs/                     # Product, architecture, roadmap, usage
├── start.bat  start.sh       # One-click launchers (Python edition)
├── docker-compose.yml
├── Dockerfile
└── .github/workflows/        # Publishes the Hugo site to GitHub Pages
```

The repository holds two things: the **self-hosted application** in `app/`, and the **Hugo site** in `content/` / `layouts/` / `assets/` that serves the landing page on GitHub Pages. See [docs/USAGE.md](docs/USAGE.md) for the static site.

## Roadmap

| Milestone | Scope | Status |
|---|---|---|
| M0 | Hugo static library on GitHub Pages | Shipped |
| **M1** | Read-only Calibre, shelf, detail page, Koodo-grade EPUB reader, progress / bookmarks / notes | **Shipped** |
| M2 | In-app upload, format conversion, light metadata editing, trash, PDF and comic reading | Planned |
| M3 | Multi-user and permissions, OPDS, device push, cross-device progress | Planned |
| M4 | Server-side full-text index, statistics, recommendations, static export, TTS | Planned |

Acceptance criteria live in [docs/ROADMAP.md](docs/ROADMAP.md).

## Docs

| Document | Contents |
|---|---|
| [docs/PRODUCT.md](docs/PRODUCT.md) | Positioning, personas, competitive notes, priorities |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, data model, API, reader design, security |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones and the explicit not-doing list |
| [docs/USAGE.md](docs/USAGE.md) | The static site: adding books, writing syntax, publishing |
| [docs/demo-library.md](docs/demo-library.md) | What the demo library contains, how to rebuild it |

## FAQ

**Will Lumen modify my Calibre library?**
No. The library is mounted read-only and there is no write path in the code. Conversions and metadata edits (M2) will go through Calibre's own CLI, explicitly, with a backup first.

**Which formats are supported?**
EPUB is read in-app. PDF opens in the browser's native viewer. MOBI and AZW3 need a one-time conversion in Calibre; `ebook-convert` integration is on the M2 list.

**Do I need Docker?**
No. The Python edition runs natively with Python 3.11+ — double-click `start.bat` or run `bash start.sh`, and it manages its own `.venv`. Docker is the reproducible option for an always-on machine; both editions share the same `.env` and the same data model.

**Can it run on GitHub Pages?**
No — Pages only serves static files, and a shelf with reading progress needs a backend. The Hugo site in this repo is the static companion.

**Will a very large library be slow?**
The shelf is paginated and indexed server-side and reads on demand; covers are fetched lazily and cached.

**I forgot the password / want to turn auth off?**
Leave `LIBRARY_PASSWORD` empty to disable it. For anything beyond a trusted LAN, put Lumen behind a reverse proxy.

**Docker cannot pull the base image.**
Some networks cannot reach Docker Hub. Add a registry mirror (Docker Desktop → Settings → Docker Engine → `registry-mirrors`), or pull `python:3.13-slim` through a mirror, `docker tag` it locally, and rebuild.

## Contributing

Issues and pull requests are welcome.

1. Read the constraints in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Calibre stays read-only, the frontend stays build-free.
2. One concern per PR; explain the motivation, not just the diff.
3. Interface changes need desktop and mobile screenshots.

## Acknowledgements

- [Calibre](https://calibre-ebook.com/) — the de facto standard for ebook libraries.
- [talebook](https://github.com/talebook/talebook) — product logic, and the semantics of reading state, highlights and notes.
- [Koodo Reader](https://github.com/koodo-reader/koodo-reader) — the benchmark for reader information architecture.
- [epub.js](https://github.com/futurepress/epub.js) — the EPUB rendering engine.
- [hugo-book](https://github.com/alex-shpak/hugo-book) — the static site theme.
- [Yuanuite/digital-library](https://github.com/yuanuite/digital-library) — the original structural inspiration for the static site.

The demo library's English titles come from [Project Gutenberg](https://www.gutenberg.org/) and are in the public domain.

## License

[MIT](LICENSE) © 2026 Haoming Xing

<div align="center"><sub>[English](README.md) · [简体中文](README.zh-CN.md)</sub></div>
