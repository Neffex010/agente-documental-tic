import {API_ROOT} from './config.js';

const NETWORK_ERROR = 'No se pudo contactar con el servidor. Revisa tu conexión.';
const TIMEOUT_ERROR = 'El servidor tardó demasiado en responder. Inténtalo de nuevo.';

function failure(message, { status = 0, transient = false } = {}) {
  const error = new Error(message);
  error.status = status;
  error.transient = transient;
  return error;
}

export class ApiClient {
  async request(path, options = {}, config = {}) {
    const { timeout = 30000, retries = 0 } = config;
    let attempt = 0;
    for (;;) {
      try {
        return await this.fetchOnce(path, options, timeout);
      } catch (error) {
        if (error.transient && attempt < retries) {
          attempt += 1;
          await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
          continue;
        }
        throw error;
      }
    }
  }

  async fetchOnce(path, options, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let response;
    try {
      response = await fetch(API_ROOT + path, { ...options, signal: controller.signal });
    } catch (error) {
      if (error && error.name === 'AbortError') throw failure(TIMEOUT_ERROR);
      throw failure(NETWORK_ERROR);
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; } catch { data = null; }

    if (!response.ok) {
      const requestTransient = response.status === 502 || response.status === 503 || response.status === 504;
      if (data && typeof data.detail === 'string') {
        throw failure(data.detail, { status: response.status, transient: requestTransient });
      }
      if (response.status === 504 || /timeout|timed out|An error occurred|FUNCTION_INVOCATION/i.test(text)) {
        throw failure(
          'El servidor tardó demasiado (límite de tiempo de Vercel). Las preguntas ya funcionan con el índice creado; sincronizar es opcional.',
          { status: response.status, transient: true }
        );
      }
      throw failure(`HTTP ${response.status}`, { status: response.status, transient: requestTransient });
    }
    return data ?? {};
  }

  health() { return this.request('/api/health', {}, { timeout: 15000 }); }
  documents() { return this.request('/api/documents', {}, { timeout: 20000 }); }
  ask(question, useSearch) {
    return this.request(
      '/api/ask',
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,use_search:useSearch})},
      { timeout: 75000, retries: 1 }
    );
  }
  sync() { return this.request('/api/sync', {method:'POST'}, { timeout: 75000 }); }
}
