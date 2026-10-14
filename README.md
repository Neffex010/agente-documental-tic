# 2.3 Agente documental con Google Drive — Archivo TIC IA

Proyecto académico de **Inteligencia artificial aplicada a las TIC**, Tecnológico Nacional de México, campus Pachuca. Continuación de **2.2 Agente investigador**: se reemplaza la búsqueda pública Web Search por recuperación documental de **Google Drive**, **OpenAI Vector Stores** y **File Search (RAG)**.

## Propósito pedagógico

El alumno comprenderá que una organización necesita consultar documentos propios y autorizados, no solamente Internet. Identificará el papel de OAuth, Google Drive API, sincronización, indexación semántica, recuperación de contexto, respuestas sustentadas y trazabilidad mediante fuentes. Comparará respuestas **sin** y **con** acceso documental, observará qué sucede al modificar una fuente y realizará todas las pruebas iniciales en **localhost**. El despliegue a Vercel es un **reto autónomo**, no una configuración lista para producción.

## Arquitectura

- `app/main.py`: FastAPI, endpoints REST, frontend estático y protección de sincronización.
- `app/core/config.py`: configuración y secretos cargados desde `.env`.
- `app/core/storage.py`: persistencia del manifiesto (local o directorio escribible).
- `app/models/documento.py`: modelos de solicitud y respuesta.
- `app/services/drive_service.py`: credenciales (OAuth Desktop, cuenta de servicio o token), listado limitado a una carpeta y descarga/exportación de archivos.
- `app/services/sync_service.py`: Vector Store, manifiesto de archivos, altas, cambios y bajas.
- `app/services/agent_service.py`: Responses API + File Search y fuentes verificadas por anotaciones de archivo.
- `index.html` y `assets/`: interfaz Bootstrap 5 y clases JavaScript.
- `run.py`: arranque local con Uvicorn.
- `vercel.json`: configuración del despliegue (entrypoint y archivos incluidos).
- `data/manifest.json`: estado local del índice (no se publica).

## 1. Requisitos

Python 3.11+, VS Code, Git, cuentas de Google Cloud y OpenAI API con créditos, navegador y documentos de prueba autorizados. **Las claves y los archivos de Drive no se incluyen en el ZIP.**

## 2. Configuración Google Drive

1. En [Google Cloud Console](https://console.cloud.google.com/), crea un proyecto y habilita **Google Drive API**.
2. Configura **Google Auth Platform**, pantalla de consentimiento y usuarios de prueba si corresponde.
3. Crea credenciales OAuth 2.0 de tipo **Desktop app** y descarga el archivo a la raíz del proyecto como `credentials.json`.
4. Crea una carpeta de Google Drive con **al menos cinco** documentos autorizados. Admite PDF, TXT y Google Docs nativos. Extrae el ID de su URL `/folders/ID`.
5. Este ejercicio utiliza el alcance `drive.readonly` para lectura; puede exigir validaciones adicionales al distribuir una app real. Usa una cuenta y una carpeta de laboratorio sin datos personales.

## 3. Preparar proyecto en Windows (PowerShell)

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edita `.env`: define `OPENAI_API_KEY`, un `OPENAI_MODEL` compatible con File Search y `GOOGLE_DRIVE_FOLDER_ID`. `VECTOR_STORE_ID` se deja vacío la primera vez: el sistema lo guardará en el manifiesto. No insertes claves en el código ni en el navegador.

## 4. Ejecutar localmente

```powershell
python run.py
```

Abre <http://127.0.0.1:5000>. Usa **Sincronizar desde Drive** para autenticar Google, descargar/exportar los archivos autorizados e indexarlos. La primera ejecución abre el navegador OAuth en la computadora donde está corriendo Python. Después escribe preguntas sobre el contenido. Para ensayar recuperación, desactiva **File Search (RAG)** y repite exactamente la misma pregunta.

**Importante:** la sincronización usa una solicitud HTTP en localhost. Si estableces `LOCAL_ADMIN_KEY`, proporciona la cabecera `X-Admin-Key` mediante Thunder Client para `/api/sync` (el botón web no envía claves administrativas). Ejecuta el backend en `127.0.0.1`, no en `0.0.0.0`.

## 5. Endpoints

| Método | Ruta | Función |
|---|---|---|
| GET | `/api/health` | Comprueba configuración y servidor. |
| GET | `/api/documents` | Documentos ya indexados (manifiesto local). |
| POST | `/api/sync` | Indexa cambios, requiere cliente desde loopback. |
| POST | `/api/ask` | Pregunta con `question` y `use_search`. |

Ejemplo JSON para Thunder Client:

```json
{"question": "¿Qué documentos tratan sobre AWS RDS?", "use_search": true}
```

## 6. Experimentos

1. Ejecuta una pregunta muy específica presente en los archivos **sin File Search**.
2. Repite **con File Search**: inspecciona contenido y fuentes (anotaciones verificadas).
3. Prueba temas ausentes: el agente debe declarar insuficiencia de información.
4. Agrega un documento con un dato singular, sincroniza y vuelve a preguntar.
5. Modifica un documento, vuelve a sincronizar y verifica que no se duplican registros en el manifiesto.
6. Elimina un documento de prueba del Drive autorizado, sincroniza y comprueba que desaparece del manifiesto.

**Limitaciones:** las búsquedas RAG pueden generar errores; comprueba siempre las respuestas contra las fuentes. La eliminación del índice tiene **consistencia eventual** y puede tardar en reflejarse. Los resultados sin citas explícitas no se presentan como fuentes. La actualización de un mismo archivo puede crear cargos transitorios mientras se reemplaza el anterior.

## 7. Pruebas automáticas

```powershell
pytest -q
```

Las pruebas son locales y no requieren claves reales ni consumen OpenAI.

## 8. Git/GitHub y despliegue en Vercel

El proyecto conserva su uso local (OAuth Desktop y `data/manifest.json`), pero ahora incluye lo necesario para desplegarse en Vercel:

- `run.py` es el arranque local; Vercel detecta la app en `app/main.py` (entrypoint de FastAPI).
- `vercel.json` fija el entrypoint (`app/main.py`) e incluye `index.html` y `assets/**` en el bundle.
- `app/core/storage.py` escribe el manifiesto en un directorio escribible (con respaldo al temporal) para no fallar en un sistema de archivos de solo lectura.
- `app/services/drive_service.py` acepta credenciales por variable de entorno, sin navegador.
- `POST /api/sync` permite acceso desde cualquier origen **solo** si se envía la cabecera `X-Admin-Key` correcta.

### 8.1 Publicar el repositorio

```powershell
git add .
git commit -m "feat: preparar despliegue en Vercel"
git push
```

### 8.2 Desplegar

1. Entra a <https://vercel.com/new> e importa el repositorio de GitHub.
2. Framework: **Other** (Vercel detecta FastAPI). No requiere Build Command.
3. En **Settings → Environment Variables** define las variables de la tabla siguiente.
4. Deploy. La URL resultante sirve la interfaz y los endpoints `/api/*`.

### 8.3 Variables de entorno en Vercel

| Variable | Obligatoria | Descripción |
|---|---|---|
| `OPENAI_API_KEY` | Sí | Clave de OpenAI. |
| `OPENAI_MODEL` | No | Modelo con File Search (por defecto `gpt-4.1-mini`). |
| `VECTOR_STORE_ID` | Recomendada | Si la defines, `/api/ask` funciona sin sincronizar. |
| `GOOGLE_DRIVE_FOLDER_ID` | Para sincronizar | ID de la carpeta de Drive. |
| `LOCAL_ADMIN_KEY` | Para sincronizar | Clave secreta que habilita `/api/sync` en remoto. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Para sincronizar | JSON de cuenta de servicio en una sola línea. |
| `GOOGLE_TOKEN_JSON` | Alternativa | Token de usuario autorizado (`token.json`) en una línea. |
| `DATA_DIR` | No | Directorio escribible (p. ej. `/tmp`). |

### 8.4 Sincronizar en Vercel (opcional)

El flujo OAuth Desktop abre un navegador y **no** funciona en serverless. Para indexar desde Vercel:

1. Crea una **cuenta de servicio** en Google Cloud y habilita Google Drive API.
2. Comparte la carpeta de Drive con el email de la cuenta de servicio (permiso de lector).
3. Pega el JSON completo de la cuenta de servicio en `GOOGLE_SERVICE_ACCOUNT_JSON` (una sola línea).
4. Define `LOCAL_ADMIN_KEY` y llama: `POST /api/sync` con la cabecera `X-Admin-Key: <clave>`.

### 8.5 Limitaciones honestas en serverless

- El manifiesto en `/tmp` es **efímero**: se pierde entre instancias frías, así que `/api/documents` puede aparecer vacío. La consulta RAG (`/api/ask`) sigue funcionando con `VECTOR_STORE_ID`. Para persistencia duradera usa almacenamiento externo (Vercel Blob desde una función Node, o una base de datos).
- `maxDuration` está en 60 s; sincronizar muchos archivos puede agotarlo (amplíalo en un plan superior).
- No hay usuarios ni sesiones: `POST /api/ask` queda abierto. No subas documentos confidenciales y protege el endpoint antes de un uso real.

## 9. Costos y privacidad

OpenAI cobra por el uso de modelos, búsqueda y almacenamiento según su tarifario vigente. No subas a OpenAI documentos confidenciales, datos personales o material sin permiso del propietario. El material descargado se transmite a OpenAI para indexación. Revoca y rota cualquier credencial filtrada, incluso si ya fue borrada de GitHub.

## Entrega

Repositorio GitHub con historia de commits, URL de Vercel si culminas el reto (o documentación del bloqueo), y conclusiones sobre OAuth, Google Drive API, RAG, File Search, FastAPI, OOP, Git/GitHub y seguridad.
