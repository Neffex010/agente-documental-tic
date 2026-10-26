from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_home():
    r = client.get("/")
    assert r.status_code == 200
    assert "Archivo TIC" in r.text


def test_health():
    assert client.get("/api/health").status_code == 200


def test_documents():
    r = client.get("/api/documents")
    assert r.status_code == 200
    assert isinstance(r.json()["documents"], list)


def test_question_validation():
    r = client.post("/api/ask", json={"question": "a"})
    assert r.status_code == 422


def test_sync_abierto_sin_clave(monkeypatch):
    """El endpoint de sincronización ya no exige clave administrativa.

    Sin OPENAI_API_KEY responde 400 (error de configuración), nunca 401/403.
    """
    from dataclasses import replace
    import app.main as main

    monkeypatch.setattr(main, "settings", replace(main.settings, openai_api_key=""))
    r = client.post("/api/sync")
    assert r.status_code == 400


def test_ask_devuelve_documentos_consultados(monkeypatch):
    """La respuesta incluye ``retrieved`` aunque el modelo no cite nada."""
    from dataclasses import replace
    import app.main as main

    class FakeAgent:
        def ask(self, question, use_search):
            return {
                "success": True,
                "answer": "respuesta",
                "sources": [],
                "retrieved": [{
                    "name": "manual.pdf",
                    "url": "https://drive.google.com/file/d/1/view",
                }],
            }

    monkeypatch.setattr(main, "settings", replace(main.settings, openai_api_key="test"))
    monkeypatch.setattr(main, "AgentService", lambda: FakeAgent())

    r = client.post("/api/ask", json={"question": "pregunta"})

    assert r.status_code == 200
    assert r.json()["sources"] == []
    assert r.json()["retrieved"][0]["name"] == "manual.pdf"
