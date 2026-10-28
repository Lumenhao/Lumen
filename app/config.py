"""运行配置。全部来自环境变量，未设置时使用仓库内的演示书库。"""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _path(value: str | None, default: Path) -> Path:
    if not value:
        return default
    p = Path(value).expanduser()
    return p if p.is_absolute() else (Path.cwd() / p)


class Settings:
    def __init__(self) -> None:
        self.library_path = _path(os.getenv("LIBRARY_PATH"), ROOT / "demo-library")
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
