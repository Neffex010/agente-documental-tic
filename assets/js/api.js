import {API_ROOT} from './config.js';
export class ApiClient {
  async request(path, options = {}) {
    let response;
    try {
      response = await fetch(API_ROOT + path, options);
    } catch {
      throw new Error('No se pudo contactar con el servidor. Revisa tu conexión.');
    }
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; } catch { data = null; }
    if (!response.ok) {
      if (data && typeof data.detail === 'string') throw new Error(data.detail);
      if (response.status === 504 || /timeout|timed out|An error occurred|FUNCTION_INVOCATION/i.test(text)) {
        throw new Error('El servidor tardó demasiado (límite de tiempo de Vercel). Las preguntas ya funcionan con el índice creado; sincronizar es opcional.');
      }
      throw new Error(`HTTP ${response.status}`);
    }
    return data ?? {};
  }
  health() { return this.request('/api/health'); }
  documents() { return this.request('/api/documents'); }
  ask(question, useSearch) { return this.request('/api/ask', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,use_search:useSearch})}); }
  sync() { return this.request('/api/sync', {method:'POST'}); }
}
