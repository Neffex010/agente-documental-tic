# Archivo TIC IA — Agente Documental RAG 🧠📁

**Práctica 2.3: Agente documental con Google Drive y búsqueda semántica RAG**
**Institución:** Tecnológico Nacional de México · Campus Pachuca
**Carrera:** Ingeniería en Sistemas Computacionales
**Asignatura:** Inteligencia Artificial Aplicada a las TIC

🚀 **Demo en Producción:** [https://agente-documental-tic-gray.vercel.app/](https://agente-documental-tic-gray.vercel.app/)

Proyecto académico de **Inteligencia artificial aplicada a las TIC**. Continuación de **2.2 Agente investigador**: se reemplaza la búsqueda pública de Internet (Web Search) por recuperación documental de **Google Drive**, **OpenAI Vector Stores** y **File Search (RAG)**.

---

## Propósito pedagógico

El alumno comprenderá que una organización necesita consultar documentos propios y autorizados, no solamente Internet. Identificará el papel de OAuth, Google Drive API, sincronización, indexación semántica, recuperación de contexto, respuestas sustentadas y trazabilidad mediante fuentes. Comparará respuestas **sin** y **con** acceso documental, observará qué sucede al modificar una fuente y realizará todas las pruebas iniciales en **localhost**. El despliegue a Vercel es un **reto autónomo**, no una configuración lista para producción.

---

## 🏗️ Arquitectura del Sistema (Despliegue Serverless)

El proyecto emplea una **Arquitectura Híbrida Desacoplada** para superar las limitaciones inherentes del entorno *Serverless* de Vercel (sistema de archivos de solo lectura y timeouts estrictos).

1. **Backend (FastAPI):** gestiona la integración con la API de OpenAI (File Search), la sincronización con Google Drive y la validación de seguridad.
2. **Frontend (HTML + CSS propio + JavaScript vanilla):** interfaz oscura tipo «developer tool» sobre Bootstrap 5.3 (vía CDN, carga diferida) y un formateador ligero propio que convierte la respuesta en párrafos, listas, negritas y `código` construyendo nodos del DOM (sin `innerHTML` de contenido del modelo). Sin frameworks UI pesados.
3. **Manejo de Estado Temporal:** para permitir la sincronización en Vercel sin violar las políticas de *Read-Only File System*, las descargas de Google Drive y el procesamiento de tipo MIME se realizan en el directorio efímero (`DATA_DIR`, p. ej. `/tmp`). El Vector Store actúa como **fuente de verdad**: si el manifiesto local se pierde, el listado y las citas se reconstruyen a partir de los atributos de los archivos (`name`, `mime_type`, `url`, `drive_id`, `modified_time`).
4. **Seguridad y Autorización:** el proceso de sincronización con Google Drive está protegido por una guardia de autorización (`X-Admin-Key`) que evita el consumo no autorizado de cuotas de API por usuarios públicos. La autenticación con Google Cloud se maneja mediante credenciales pre-inyectadas por variables de entorno (`GOOGLE_SERVICE_ACCOUNT_JSON` o `GOOGLE_TOKEN_JSON`).

### Estructura del proyecto

- `app/main.py`: FastAPI, endpoints REST, frontend estático y protección de la sincronización.
- `app/core/config.py`: configuración y secretos cargados desde `.env`.
- `app/core/storage.py`: persistencia del manifiesto (local o directorio escribible, con respaldo temporal).
- `app/models/documento.py`: modelos de solicitud y respuesta.
- `app/services/drive_service.py`: credenciales (OAuth Desktop, cuenta de servicio o token), listado limitado a una carpeta y descarga/exportación de archivos.
- `app/services/sync_service.py`: Vector Store, manifiesto de archivos, altas, cambios, bajas y reconciliación desde el índice.
- `app/services/agent_service.py`: Responses API + File Search y fuentes verificadas por anotaciones de archivo.
- `index.html` y `assets/`: interfaz Bootstrap 5 y clases JavaScript (sin framework).
- `run.py`: arranque local con Uvicorn.
- `vercel.json`: configuración del despliegue (entrypoint y archivos incluidos).
- `data/manifest.json`: estado local del índice (no se publica).

---

## 🛠️ Tecnologías Utilizadas

- **Framework API:** Python 3.11+ (3.12 en Vercel) / FastAPI / Uvicorn
- **IA y Modelos:** OpenAI `gpt-4o-mini` (configurable con `OPENAI_MODEL`) / OpenAI Vector Stores (File Search · RAG)
- **Integración Cloud:** Google Drive API (v3) / Google OAuth Platform (Desktop) o cuenta de servicio
- **Frontend:** HTML5 + CSS propio (tema oscuro zinc) + Vanilla JS (ES Modules) + Bootstrap 5.3
- **Pruebas y Calidad:** Pytest (5/5 pruebas en verde)
- **Despliegue:** Vercel (red serverless)

---

## 📊 Evaluación de Búsqueda (Pruebas A/B)

La interfaz incluye un *switch* para activar/desactivar el **File Search** (búsqueda RAG). A continuación se presenta la evaluación del impacto del contexto inyectado desde Google Drive:

| Criterio Evaluado | Sin File Search (GPT-4o base) | Con File Search (Agente RAG + Drive) |
| :--- | :--- | :--- |
| **Precisión de la información** | Responde con información genérica de internet, a menudo desactualizada o no aplicable al contexto local. | Responde con alta precisión basándose **exclusivamente** en las especificaciones, apuntes o manuales almacenados en Google Drive. |
| **Alucinaciones (respuestas inventadas)** | Altamente propenso a inventar normativas o estándares técnicos si la pregunta es muy específica sobre un proyecto interno. | Riesgo casi nulo. El modelo condiciona su respuesta a los fragmentos semánticos recuperados del Vector Store. |
| **Citas y Fuentes** | No proporciona fuentes verificables. | Proporciona citas referenciadas a documentos específicos (ej. *'pdf-reparacion-de-laptops.pdf'*). |
| **Tiempo de respuesta** | Menor a 2 segundos (inferencia directa). | Ligeramente mayor (~3-4 segundos) por el proceso intermedio de recuperación semántica (*retrieval*). |

> Cuando el modelo **no** cita documentos, la interfaz lo indica de forma explícita ("el modelo no citó documentos") en lugar de mostrar una lista de fuentes vacía sin explicación.

---

## 📦 Instalación y Ejecución Local

Para desarrollo, el sistema utiliza `InstalledAppFlow` para abrir una ventana OAuth en el navegador.

### 1. Requisitos

Python 3.11+, VS Code, Git, cuentas de Google Cloud y OpenAI API con créditos, navegador y documentos de prueba autorizados. **Las claves y los archivos de Drive no se incluyen en el repositorio.**

### 2. Configuración de Google Drive

1. En [Google Cloud Console](https://console.cloud.google.com/), crea un proyecto y habilita **Google Drive API**.
2. Configura **Google Auth Platform**, la pantalla de consentimiento y usuarios de prueba si corresponde.
3. Crea credenciales OAuth 2.0 de tipo **Desktop app** y descarga el archivo a la raíz del proyecto como `credentials.json`.
4. Crea una carpeta de Google Drive con **al menos cinco** documentos autorizados. Admite PDF, TXT, DOCX, PPTX, CSV y Google Docs nativos (se exportan como PDF). Extrae el ID de su URL `/folders/ID`.
5. Este ejercicio utiliza el alcance `drive.readonly` para lectura; puede exigir validaciones adicionales al distribuir una app real. Usa una cuenta y una carpeta de laboratorio sin datos personales.

### Clonar e instalar (Windows · PowerShell)

```powershell
git clone https://github.com/Neffex010/agente-documental-tic.git
cd agente-documental-tic
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edita `.env`: define `OPENAI_API_KEY`, un `OPENAI_MODEL` compatible con File Search y `GOOGLE_DRIVE_FOLDER_ID`. `VECTOR_STORE_ID` se deja vacío la primera vez: el sistema lo guardará en el manifiesto. No insertes claves en el código ni en el navegador.

### Ejecutar localmente

```powershell
python run.py
```

Abre <http://127.0.0.1:5000>. Usa **Sincronizar desde Drive** para autenticar Google, descargar/exportar los archivos autorizados e indexarlos. La primera ejecución abre el navegador OAuth en la computadora donde está corriendo Python. Después escribe preguntas sobre el contenido. Para ensayar la recuperación, desactiva **File Search (RAG)** y repite exactamente la misma pregunta.

**Importante:** en `localhost` la sincronización funciona directamente. Si defines `LOCAL_ADMIN_KEY`, escríbela en el campo **«Clave administrativa»** de la interfaz (o envíala como cabecera `X-Admin-Key`); es obligatoria fuera de localhost. Ejecuta el backend en `127.0.0.1`, no en `0.0.0.0`.

### Guía rápida de la interfaz

- **¿Cómo funciona?** al pie de la página: los tres pasos (indexar → preguntar → verificar), atajos de teclado y solución de problemas frecuentes.
- **Preguntas de ejemplo:** botones que rellenan el campo de consulta.
- **Formato de respuesta:** párrafos, listas, negritas y `código`; botones **Copiar** y **Limpiar**; contador de fuentes citadas.
- **Atajos:** `/` enfoca la pregunta, `Ctrl`+`Enter` consulta, `Esc` limpia el campo.

---

## 🔌 Endpoints

| Método | Ruta | Función |
|---|---|---|
| GET | `/` | Interfaz web (frontend estático). |
| GET | `/favicon.ico` | Icono del sitio. |
| GET | `/api/health` | Comprueba configuración y servidor. |
| GET | `/api/documents` | Documentos ya indexados (manifiesto local o índice de OpenAI). |
| POST | `/api/sync` | Indexa cambios; requiere origen local o la cabecera `X-Admin-Key`. |
| POST | `/api/ask` | Pregunta con `question` y `use_search`. |

Ejemplo JSON para Thunder Client:

```json
{"question": "¿Qué documentos tratan sobre instalaciones eléctricas?", "use_search": true}
```

---

## 🧪 Experimentos

1. Ejecuta una pregunta muy específica presente en los archivos **sin File Search**.
2. Repite **con File Search**: inspecciona contenido y fuentes (anotaciones verificadas).
3. Prueba temas ausentes: el agente debe declarar insuficiencia de información.
4. Agrega un documento con un dato singular, sincroniza y vuelve a preguntar.
5. Modifica un documento, vuelve a sincronizar y verifica que no se duplican registros en el manifiesto.
6. Elimina un documento de prueba del Drive autorizado, sincroniza y comprueba que desaparece del manifiesto y del índice.

**Limitaciones:** las búsquedas RAG pueden generar errores; comprueba siempre las respuestas contra las fuentes. La eliminación del índice tiene **consistencia eventual** y puede tardar en reflejarse. Los resultados sin citas explícitas no se presentan como fuentes. La actualización de un mismo archivo puede crear cargos transitorios mientras se reemplaza el anterior.

---

## ✅ Pruebas automáticas

```powershell
pytest -q
```

Las pruebas son locales y no requieren claves reales ni consumen OpenAI.

---

## 🚀 Git/GitHub y despliegue en Vercel

El proyecto conserva su uso local (OAuth Desktop y `data/manifest.json`), pero incluye lo necesario para desplegarse en Vercel:

- `run.py` es el arranque local; Vercel detecta la app en `app/main.py` (entrypoint de FastAPI).
- `vercel.json` fija el entrypoint (`app/main.py`) e incluye `index.html` y `assets/**` en el bundle.
- `app/core/storage.py` escribe el manifiesto en un directorio escribible (`DATA_DIR`, con respaldo al temporal) para no fallar en un sistema de archivos de solo lectura.
- `app/services/drive_service.py` acepta credenciales por variable de entorno, sin navegador.
- `POST /api/sync` permite acceso desde cualquier origen **solo** si se envía la cabecera `X-Admin-Key` correcta.

### Publicar el repositorio

```powershell
git add .
git commit -m "feat: preparar despliegue en Vercel"
git push
```

### Desplegar

1. Entra a <https://vercel.com/new> e importa el repositorio de GitHub.
2. Framework: **Other** (Vercel detecta FastAPI). No requiere Build Command.
3. En **Settings → Environment Variables** define las variables de la tabla siguiente.
4. Deploy. La URL resultante sirve la interfaz y los endpoints `/api/*`.

### Variables de entorno en Vercel

| Variable | Obligatoria | Descripción |
|---|---|---|
| `OPENAI_API_KEY` | Sí | Clave de OpenAI. |
| `OPENAI_MODEL` | No | Modelo con File Search (por defecto `gpt-4.1-mini`; la demo usa `gpt-4o-mini`). |
| `VECTOR_STORE_ID` | Recomendada | Si la defines, `/api/ask` funciona sin sincronizar. |
| `GOOGLE_DRIVE_FOLDER_ID` | Para sincronizar | ID de la carpeta de Drive. |
| `LOCAL_ADMIN_KEY` | Para sincronizar | Clave secreta que habilita `/api/sync` en remoto. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Para sincronizar | JSON de cuenta de servicio en una sola línea. |
| `GOOGLE_TOKEN_JSON` | Alternativa | Token de usuario autorizado (`token.json`, con `refresh_token`) en una línea. |
| `DATA_DIR` | No | Directorio escribible (p. ej. `/tmp`); si no se define, se usa el temporal. |

### Sincronizar en Vercel (opcional)

El flujo OAuth Desktop abre un navegador y **no** funciona en serverless. Para indexar desde Vercel:

1. Crea una **cuenta de servicio** en Google Cloud y habilita Google Drive API.
2. Comparte la carpeta de Drive con el email de la cuenta de servicio (permiso de lector).
3. Pega el JSON completo de la cuenta de servicio en `GOOGLE_SERVICE_ACCOUNT_JSON` (una sola línea).
4. Define `LOCAL_ADMIN_KEY` y escribe esa misma clave en el campo **«Clave administrativa»** de la interfaz (o llama a `POST /api/sync` con la cabecera `X-Admin-Key: <clave>`).
5. Tras cambiar cualquier variable de entorno, **vuelve a desplegar** (Redeploy) para que surta efecto.

### Limitaciones honestas en serverless

- El manifiesto en `/tmp` es **efímero**: se pierde entre instancias frías. Por eso `/api/documents` reconstruye la lista desde los atributos del Vector Store de OpenAI, y `/api/ask` sigue funcionando con `VECTOR_STORE_ID`. Para persistencia duradera usa almacenamiento externo (Vercel Blob desde una función Node, o una base de datos).
- `maxDuration` está en 60 s; sincronizar muchos archivos puede agotarlo (amplíalo en un plan superior). La interfaz muestra un contador de segundos durante la sincronización.
- No hay usuarios ni sesiones: `POST /api/ask` queda abierto. No subas documentos confidenciales y protege el endpoint antes de un uso real.

---

## 🔒 Costos y privacidad

OpenAI cobra por el uso de modelos, búsqueda y almacenamiento según su tarifario vigente. No subas a OpenAI documentos confidenciales, datos personales o material sin permiso del propietario. El material descargado se transmite a OpenAI para indexación. Revoca y rota cualquier credencial filtrada, incluso si ya fue borrada de GitHub.

---

## Entrega

Repositorio GitHub con historia de commits, la URL de Vercel si culminas el reto (o documentación del bloqueo) y conclusiones sobre OAuth, Google Drive API, RAG, File Search, FastAPI, OOP, Git/GitHub y seguridad.
