"""Aplicación académica. La sincronización está abierta: ver README (sección de seguridad)."""
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.models.documento import AskRequest, AskResponse
from app.services.sync_service import SyncService, list_indexed_documents
from app.services.agent_service import AgentService

ROOT = Path(__file__).resolve().parents[1]
app = FastAPI(title="Archivo TIC IA", version="1.0.0")
app.mount("/assets", StaticFiles(directory=ROOT / "assets"), name="assets")

@app.get("/")
def index():
    return FileResponse(ROOT / "index.html")

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    # Favicon SVG servido también en la ruta raíz para evitar 404 de navegadores.
    return FileResponse(ROOT / "assets" / "favicon.svg", media_type="image/svg+xml")

@app.get("/api/health")
def health():
    return {"status": "ok", "configured": bool(settings.openai_api_key and settings.drive_folder_id)}

@app.get("/api/documents")
def documents():
    manifest = SyncService.load_manifest()
    docs = list(manifest.get("documents", {}).values())
    source = "manifest"
    if not docs and settings.openai_api_key:
        # Recuperación: si el manifiesto local es efímero (p. ej. en Vercel),
        # se reconstruye la lista desde el Vector Store de OpenAI.
        try:
            recovered = list_indexed_documents()
            if recovered:
                docs, source = recovered, "vector_store"
        except Exception:
            pass
    return {"documents": docs,
            "indexed": len(docs),
            "source": source,
            "vector_store_configured": bool(settings.vector_store_id or manifest.get("vector_store_id"))}

@app.post("/api/ask", response_model=AskResponse)
def ask(payload: AskRequest):
    try:
        if not settings.openai_api_key: raise ValueError("Falta OPENAI_API_KEY")
        return AgentService().ask(payload.question, payload.use_search)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=502, detail="Error al consultar OpenAI. Revisa el registro local.")

@app.post("/api/sync")
def sync():
    """Indexa los cambios de la carpeta de Drive.

    Endpoint abierto (sin autenticación) por decisión del proyecto: cualquiera
    que conozca la URL puede lanzar una sincronización y consumir cuota de
    OpenAI/Drive. No exponerlo públicamente sin protección adicional.
    """
    try:
        if not settings.openai_api_key: raise ValueError("Falta OPENAI_API_KEY")
        return SyncService().sync()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Sincronización fallida: {exc}")
