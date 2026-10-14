"""Persistencia del manifiesto JSON (documentos indexados y Vector Store).

Pensado para funcionar igual en local y en entornos serverless (Vercel), donde
el sistema de archivos del proyecto es de solo lectura:

1. Si DATA_DIR es escribible, se usa (por defecto ``<repo>/data``).
2. Si no lo es, se recurre al directorio temporal del sistema (efímero).

Nota: en Vercel el manifiesto es efímero (se pierde entre instancias frías).
Para persistencia duradera hay que usar un almacenamiento externo. La consulta
RAG sigue funcionando con la variable de entorno ``VECTOR_STORE_ID``.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _empty() -> dict:
    return {"vector_store_id": "", "documents": {}}


def _writable(path: Path) -> bool:
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return True
    except OSError:
        return False


def _resolve_dir() -> Path:
    override = os.getenv("DATA_DIR", "").strip()
    candidates = [Path(override)] if override else []
    candidates.append(ROOT / "data")
    candidates.append(Path(tempfile.gettempdir()) / "archivo-tic")
    for candidate in candidates:
        if _writable(candidate):
            return candidate
    return Path(tempfile.gettempdir())


DATA_DIR = _resolve_dir()
MANIFEST = DATA_DIR / "manifest.json"


def read_manifest() -> dict:
    try:
        if MANIFEST.exists():
            data = json.loads(MANIFEST.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                data.setdefault("vector_store_id", "")
                data.setdefault("documents", {})
                return data
    except (OSError, ValueError):
        pass
    return _empty()


def write_manifest(data: dict) -> None:
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    tmp = MANIFEST.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, MANIFEST)
