"""Pruebas del agente: citas, documentos consultados y deduplicación."""
from types import SimpleNamespace

from app.services import agent_service


def _manifest(docs):
    return {"vector_store_id": "vs-test", "documents": docs}


def _response(results, annotations):
    content = SimpleNamespace(type="output_text", annotations=annotations)
    message = SimpleNamespace(type="message", content=[content])
    call = SimpleNamespace(type="file_search_call", results=results)
    return SimpleNamespace(output=[call, message], output_text="respuesta")


class _FakeClient:
    def __init__(self, response):
        self.kwargs = None
        outer = self

        class Responses:
            def create(self, **kwargs):
                outer.kwargs = kwargs
                return response

        self.responses = Responses()


def test_pide_los_resultados_de_file_search(monkeypatch):
    response = _response([], [])
    client = _FakeClient(response)
    monkeypatch.setattr(agent_service.SyncService, "load_manifest",
                        staticmethod(lambda: _manifest({})))

    agent_service.AgentService(client=client).ask("pregunta", use_search=True)

    assert client.kwargs["include"] == ["file_search_call.results"]


def test_devuelve_citas_y_documentos_consultados_sin_duplicados(monkeypatch):
    docs = {
        "drive-1": {
            "name": "reparacion-de-laptops.pdf",
            "openai_file_id": "file-1",
            "url": "https://drive.google.com/file/d/1/view",
        }
    }
    result = SimpleNamespace(
        file_id="file-1",
        filename="reparacion-de-laptops.pdf",
        attributes={
            "name": "reparacion-de-laptops.pdf",
            "url": "https://drive.google.com/file/d/1/view",
        },
    )
    annotations = [
        SimpleNamespace(type="file_citation", file_id="file-1",
                        filename="reparacion-de-laptops.pdf"),
        SimpleNamespace(type="file_citation", file_id="file-1",
                        filename="reparacion-de-laptops.pdf"),
    ]
    monkeypatch.setattr(agent_service.SyncService, "load_manifest",
                        staticmethod(lambda: _manifest(docs)))

    data = agent_service.AgentService(client=_FakeClient(_response([result, result], annotations))).ask(
        "pregunta", use_search=True
    )

    assert data["sources"] == [{
        "name": "reparacion-de-laptops.pdf",
        "url": "https://drive.google.com/file/d/1/view",
    }]
    # El mismo archivo aparece dos veces en los resultados: se muestra una vez.
    assert data["retrieved"] == [{
        "name": "reparacion-de-laptops.pdf",
        "url": "https://drive.google.com/file/d/1/view",
    }]


def test_sin_citas_conserva_documentos_consultados(monkeypatch):
    result = SimpleNamespace(
        file_id="file-2",
        filename="manual.pdf",
        attributes={"name": "manual.pdf", "url": "https://drive.google.com/file/d/2/view"},
    )
    monkeypatch.setattr(agent_service.SyncService, "load_manifest",
                        staticmethod(lambda: _manifest({})))

    data = agent_service.AgentService(client=_FakeClient(_response([result], []))).ask(
        "pregunta", use_search=True
    )

    assert data["sources"] == []
    assert data["retrieved"] == [{
        "name": "manual.pdf",
        "url": "https://drive.google.com/file/d/2/view",
    }]


def test_sin_busqueda_no_pide_resultados(monkeypatch):
    client = _FakeClient(_response([], []))
    monkeypatch.setattr(agent_service.SyncService, "load_manifest",
                        staticmethod(lambda: _manifest({})))

    data = agent_service.AgentService(client=client).ask("pregunta", use_search=False)

    assert "include" not in client.kwargs
    assert data["retrieved"] == []
