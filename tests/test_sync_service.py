"""Pruebas de limpieza y deduplicación del Vector Store."""
from types import SimpleNamespace

from app.services import sync_service


class _Files:
    def __init__(self, items):
        self.items = items
        self.deleted = []

    def list(self, vector_store_id, limit=100):
        return list(self.items)

    def retrieve(self, vector_store_id, file_id):
        for item in self.items:
            if item.id == file_id:
                return item
        raise RuntimeError("no encontrado")

    def delete(self, vector_store_id, file_id):
        self.deleted.append(file_id)
        return SimpleNamespace(deleted=True)


class _Client:
    def __init__(self, items):
        self.files_api = _Files(items)
        self.vector_stores = SimpleNamespace(files=self.files_api)


def test_purge_conserva_el_vigente_y_borra_duplicados_y_restos():
    items = [
        SimpleNamespace(id="keep", attributes={"name": "a.pdf", "drive_id": "d1"}),
        SimpleNamespace(id="dup", attributes={"name": "a.pdf", "drive_id": "d1"}),
        SimpleNamespace(id="legacy", attributes={"name": "viejo.pdf"}),
        SimpleNamespace(id="sin-atributos", attributes={}),
    ]
    client = _Client(items)
    service = sync_service.SyncService(client=client, drive=object())

    removed = service._purge_orphans({"d1": {"openai_file_id": "keep"}}, "vs-test")

    assert removed == 2
    assert client.files_api.deleted == ["dup", "legacy"]


def test_list_indexed_documents_deduplica_por_url(monkeypatch):
    attrs = {
        "name": "a.pdf",
        "url": "https://drive.google.com/file/d/1/view",
        "mime_type": "application/pdf",
    }
    items = [
        SimpleNamespace(id="file-1", status="completed", attributes=attrs),
        SimpleNamespace(id="file-2", status="completed", attributes=attrs),
    ]
    monkeypatch.setattr(sync_service, "settings", SimpleNamespace(vector_store_id="vs-test"))

    docs = sync_service.list_indexed_documents(_Client(items))

    assert len(docs) == 1
    assert docs[0]["openai_file_id"] == "file-1"
