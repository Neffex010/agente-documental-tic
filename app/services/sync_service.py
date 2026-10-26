"""Sincronización unidireccional: Drive -> OpenAI Vector Store.
Nota: eliminar archivos de un vector store puede tener consistencia eventual.
"""

import tempfile
import threading
from pathlib import Path
from openai import OpenAI
from app.core.config import settings
from app.core.storage import read_manifest, write_manifest
from app.services.drive_service import DriveService

_LOCK = threading.Lock()

# Tipos MIME permitidos incluyendo Word (.docx, .doc), PPTX, Markdown y PDF
SUPPORTED = {
    "application/pdf",
    "text/plain",
    "text/markdown",
    "text/csv",
    "text/html",
    "application/json",
    "application/vnd.google-apps.document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/msword",  # .doc
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # .pptx
}


class SyncService:
    def __init__(self, client=None, drive=None):
        self.client = client or OpenAI(api_key=settings.openai_api_key)
        self.drive = drive or DriveService()

    @staticmethod
    def load_manifest() -> dict:
        return read_manifest()

    @staticmethod
    def save_manifest(data: dict):
        write_manifest(data)

    def get_store(self, manifest):
        vector_id = settings.vector_store_id or manifest.get("vector_store_id")
        if not vector_id:
            vector_id = self.client.vector_stores.create(
                name="Archivo TIC IA - Documentos"
            ).id
        manifest["vector_store_id"] = vector_id
        return vector_id

    def _file_attributes(self, store: str, item) -> dict:
        """Atributos de un archivo del store, consultando el detalle si hace falta."""
        attrs = _attributes_of(item)
        if attrs:
            return attrs
        try:
            detail = self.client.vector_stores.files.retrieve(
                vector_store_id=store, file_id=item.id
            )
            return _attributes_of(detail)
        except Exception:
            return {}

    def _reconcile_from_store(self, docs: dict, store: str) -> int:
        """Reconstruye el mapa de documentos a partir del Vector Store.

        Necesario cuando el manifiesto local no está disponible (Vercel): sin
        esto, cada sincronización subiría otra vez todos los archivos. Usa los
        atributos guardados al indexar (``drive_id`` y ``modified_time``).
        Devuelve cuántos documentos se recuperaron.
        """
        restored = 0
        for item in self.client.vector_stores.files.list(
            vector_store_id=store, limit=100
        ):
            attrs = self._file_attributes(store, item)
            drive_id = str(attrs.get("drive_id") or "")
            if not drive_id:
                continue
            candidate = {
                "name": str(attrs.get("name") or ""),
                "modified_time": attrs.get("modified_time") or None,
                "mime_type": str(attrs.get("mime_type") or ""),
                "openai_file_id": item.id,
                "url": str(attrs.get("url") or ""),
            }
            previous = docs.get(drive_id)
            if previous and str(previous.get("modified_time") or "") > str(
                candidate["modified_time"] or ""
            ):
                # Versiones duplicadas: se conserva la más reciente.
                continue
            docs[drive_id] = candidate
            restored += 1
        return restored

    def _purge_orphans(self, docs: dict, store: str) -> int:
        """Elimina versiones antiguas y restos que ya no corresponden al manifiesto.

        Se conserva siempre el archivo vigente de cada ``drive_id``. Solo se
        borran los que no figuran en ``docs``: versiones anteriores del mismo
        documento (mismo ``drive_id``, otro ``file_id``) y subidas antiguas sin
        atributos. Si no se pueden leer los atributos, el archivo no se toca.
        """
        known = {d.get("openai_file_id") for d in docs.values() if d.get("openai_file_id")}
        removed = 0
        for item in self.client.vector_stores.files.list(
            vector_store_id=store, limit=100
        ):
            if item.id in known:
                continue
            attrs = self._file_attributes(store, item)
            name = str(attrs.get("name") or "")
            drive_id = str(attrs.get("drive_id") or "")
            if not name and not drive_id:
                continue
            try:
                self.client.vector_stores.files.delete(
                    vector_store_id=store, file_id=item.id
                )
                removed += 1
            except Exception:
                pass
        return removed

    def sync(self):
        if not _LOCK.acquire(blocking=False):
            raise RuntimeError("Ya existe una sincronización en curso")
        try:
            manifest = self.load_manifest()
            docs = manifest.setdefault("documents", {})
            store = self.get_store(manifest)
            if not docs:
                # Sin manifiesto local (p. ej. en Vercel) el estado se reconstruye
                # desde el propio Vector Store: así la sincronización es
                # incremental y no vuelve a subir todo como duplicados.
                self._reconcile_from_store(docs, store)
            self.save_manifest(manifest)
            source = self.drive.list_files(settings.drive_folder_id)

            # Filtro por tipos MIME declarados o cualquier texto estructurado
            eligible = {
                x["id"]: x
                for x in source
                if x["mimeType"] in SUPPORTED or x["mimeType"].startswith("text/")
            }

            stats = {
                "added": 0,
                "updated": 0,
                "removed": 0,
                "unchanged": 0,
                "errors": [],
            }
            for drive_id, item in eligible.items():
                previous = docs.get(drive_id)
                if previous and previous.get("modified_time") == item.get(
                    "modifiedTime"
                ):
                    stats["unchanged"] += 1
                    continue
                try:
                    raw, filename, target_mime = self.drive.get_bytes(item)
                    if not raw:
                        raise ValueError("El archivo está vacío")

                    # Extraer la extensión real del archivo
                    suffix = Path(filename).suffix or ".txt"

                    with tempfile.NamedTemporaryFile(
                        suffix=suffix, delete=False
                    ) as temp:
                        temp.write(raw)
                        path = Path(temp.name)
                    url = item.get("webViewLink") or (
                        "https://docs.google.com/document/d/" + drive_id + "/edit"
                        if item["mimeType"] == "application/vnd.google-apps.document"
                        else "https://drive.google.com/file/d/" + drive_id + "/view"
                    )
                    # Atributos que permiten reconstruir el estado y el listado
                    # desde el Vector Store cuando el manifiesto local no existe.
                    attributes = {
                        "name": filename,
                        "mime_type": target_mime,
                        "url": url,
                        "drive_id": drive_id,
                        "modified_time": item.get("modifiedTime") or "",
                    }
                    try:
                        with path.open("rb") as fh:
                            upload = self.client.vector_stores.files.upload_and_poll(
                                vector_store_id=store,
                                file=(filename, fh),
                                attributes=attributes,
                            )
                    finally:
                        path.unlink(missing_ok=True)

                    if upload.status != "completed":
                        raise RuntimeError("Indexación no completada: " + upload.status)

                    # Algunas subidas no conservan los atributos; se aseguran aquí,
                    # porque son los que permiten reconstruir el listado sin manifiesto.
                    if not getattr(upload, "attributes", None):
                        try:
                            self.client.vector_stores.files.update(
                                vector_store_id=store,
                                file_id=upload.id,
                                attributes=attributes,
                            )
                        except Exception:
                            pass

                    # Solo eliminar la versión antigua tras indexar exitosamente la nueva
                    if previous:
                        self.client.vector_stores.files.delete(
                            vector_store_id=store, file_id=previous["openai_file_id"]
                        )

                    docs[drive_id] = {
                        "name": filename,
                        "modified_time": item.get("modifiedTime"),
                        "mime_type": item["mimeType"],
                        "openai_file_id": upload.id,
                        "url": url,
                    }
                    self.save_manifest(manifest)
                    stats["updated" if previous else "added"] += 1
                except Exception as exc:
                    stats["errors"].append({"file": item["name"], "error": str(exc)})

            for drive_id in set(docs) - set(eligible):
                try:
                    self.client.vector_stores.files.delete(
                        vector_store_id=store, file_id=docs[drive_id]["openai_file_id"]
                    )
                    del docs[drive_id]
                    self.save_manifest(manifest)
                    stats["removed"] += 1
                except Exception as exc:
                    stats["errors"].append({"file": drive_id, "error": str(exc)})

            # Restos de versiones anteriores que quedaron dentro del store.
            stats["removed"] += self._purge_orphans(docs, store)

            return {
                "vector_store_id": store,
                "stats": stats,
                "documents": list(docs.values()),
            }
        finally:
            _LOCK.release()


_MIME_BY_EXT = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".html": "text/html",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


def _mime_from_name(name: str) -> str:
    return _MIME_BY_EXT.get(Path(name).suffix.lower(), "")


def _attributes_of(item) -> dict:
    raw = getattr(item, "attributes", None)
    if isinstance(raw, dict):
        return raw
    dump = getattr(raw, "model_dump", None)
    if callable(dump):
        try:
            return dump(exclude_none=True)
        except Exception:
            return {}
    return {}


def list_indexed_documents(client=None, limit: int = 100) -> list:
    """Recupera los documentos indexados directamente desde el Vector Store.

    Pensado para entornos donde el manifiesto local es efímero (p. ej. Vercel):
    lista los archivos realmente presentes en OpenAI, sin necesitar Google Drive
    ni el manifiesto. Usa los ``attributes`` guardados al subir; si no existen
    (subidas antiguas), obtiene el nombre del propio archivo en OpenAI.
    """
    client = client or OpenAI(api_key=settings.openai_api_key)
    store = settings.vector_store_id or read_manifest().get("vector_store_id")
    if not store:
        return []

    documents = []
    seen = set()
    for item in client.vector_stores.files.list(vector_store_id=store, limit=limit):
        if getattr(item, "status", "") not in ("", "completed"):
            continue
        file_id = getattr(item, "id", "")
        attrs = _attributes_of(item)
        if not attrs:
            # El listado puede no incluir aún los atributos: se pide el detalle.
            try:
                detail = client.vector_stores.files.retrieve(
                    vector_store_id=store, file_id=file_id
                )
                attrs = _attributes_of(detail)
            except Exception:
                pass
        name = str(attrs.get("name") or "")
        mime = str(attrs.get("mime_type") or "")
        url = str(attrs.get("url") or "")
        if not name:
            try:
                name = getattr(client.files.retrieve(file_id), "filename", "") or ""
            except Exception:
                name = ""
        if not mime:
            mime = _mime_from_name(name)
        # Deduplicar versiones antiguas del mismo documento de Drive.
        key = url or name.lower()
        if key in seen:
            continue
        seen.add(key)
        documents.append(
            {
                "name": name or file_id,
                "modified_time": None,
                "mime_type": mime,
                "openai_file_id": file_id,
                "url": url,
                "recovered": True,
            }
        )
    documents.sort(key=lambda d: d["name"].lower())
    return documents
