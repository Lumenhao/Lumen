"""运行配置。全部来自环境变量，未设置时使用仓库内的演示书库。"""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """仓库根目录的 .env 同时供 Docker 版与 Python 版使用。"""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def _path(value: str | None, default: Path) -> Path:
    if not value:
        return default
    p = Path(value).expanduser()
    return p if p.is_absolute() else (Path.cwd() / p)


class Settings:
    def __init__(self) -> None:
        _load_dotenv(ROOT / ".env")
        # Compose 里用 CALIBRE_PATH 指定挂载源；Python 版没有挂载，直接把它当书库路径
        library = os.getenv("LIBRARY_PATH") or os.getenv("CALIBRE_PATH")
        self.library_path = _path(library, ROOT / "demo-library")
        self.data_dir = _path(os.getenv("DATA_DIR"), ROOT / "data")
        self.host = os.getenv("HOST", "127.0.0.1")
        self.port = int(os.getenv("PORT", "8080"))
        self.site_name = os.getenv("SITE_NAME", "星皓书房")
        self.password = os.getenv("LIBRARY_PASSWORD", "")
        self.data_dir.mkdir(parents=True, exist_ok=True)

    @property
    def metadata_db(self) -> Path:
        return self.library_path / "metadata.db"

    @property
    def is_demo(self) -> bool:
        return self.library_path.resolve() == (ROOT / "demo-library").resolve()


settings = Settings()
