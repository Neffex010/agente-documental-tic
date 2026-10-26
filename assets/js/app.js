import { ApiClient } from './api.js';

const api = new ApiClient();
const el = (id) => document.getElementById(id);

const state = { documents: [], lastAnswer: '' };

/* --------------------------------------------------------------- almacenamiento */
const STORAGE_KEYS = {
  documents: 'archivo-tic:documents',
  question: 'archivo-tic:question',
  filter: 'archivo-tic:filter',
  sort: 'archivo-tic:sort',
};

function readStore(store, key) {
  try { return store.getItem(key); } catch (_) { return null; }
}

function writeStore(store, key, value) {
  try {
    if (value) store.setItem(key, value);
    else store.removeItem(key);
  } catch (_) { /* almacenamiento no disponible (modo privado) */ }
}

function debounce(fn, wait = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/* ------------------------------------------------------------------- helpers */
function linkFor(source) {
  if (!source || !source.url) return null;
  try {
    const u = new URL(source.url);
    if (u.protocol === 'https:' && ['drive.google.com', 'docs.google.com'].includes(u.hostname)) return u.href;
  } catch (_) {}
  return null;
}

function setMessage(text, danger = false) {
  const node = el('message');
  node.textContent = text || '';
  node.className = 'small mt-3 ' + (danger ? 'text-danger' : 'text-body-secondary');
}

function notify(message, variant = 'secondary') {
  const container = el('toasts');
  if (!container || typeof bootstrap === 'undefined') {
    setMessage(message, variant === 'danger');
    return;
  }
  const toast = document.createElement('div');
  toast.className = 'toast align-items-center' + (variant === 'danger' ? ' toast-danger' : '');
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.setAttribute('aria-atomic', 'true');

  const flex = document.createElement('div');
  flex.className = 'd-flex';
  const body = document.createElement('div');
  body.className = 'toast-body';
  body.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn-close btn-close-white me-2 m-auto';
  close.setAttribute('data-bs-dismiss', 'toast');
  close.setAttribute('aria-label', 'Cerrar');
  flex.append(body, close);
  toast.append(flex);
  container.append(toast);

  const instance = new bootstrap.Toast(toast, { delay: 4000 });
  toast.addEventListener('hidden.bs.toast', () => toast.remove());
  instance.show();
}

function setLoading(button, loading, label) {
  if (!button) return;
  if (loading) {
    button.dataset.label = button.textContent;
    button.replaceChildren();
    const spinner = document.createElement('span');
    spinner.className = 'spinner-border spinner-border-sm me-2';
    spinner.setAttribute('aria-hidden', 'true');
    button.append(spinner, document.createTextNode(label || button.dataset.label));
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  } else {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = button.dataset.label || button.textContent;
  }
}

function setLoadingLabel(button, label) {
  const node = button && button.lastChild;
  if (node && node.nodeType === 3) node.nodeValue = label;
}

function fileKind(mime = '') {
  const m = String(mime).toLowerCase();
  if (m.includes('pdf')) return 'PDF';
  if (m.includes('wordprocessingml') || m === 'application/msword') return 'DOC';
  if (m.includes('presentationml') || m.includes('powerpoint')) return 'PPT';
  if (m.includes('csv')) return 'CSV';
  if (m.includes('json')) return 'JSON';
  if (m.includes('google-apps.document')) return 'GDOC';
  if (m.includes('html')) return 'HTML';
  if (m.startsWith('text/')) return 'TXT';
  return 'FILE';
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d) ? '' : d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
}

function emptyState(title, detail) {
  const box = document.createElement('div');
  box.className = 'doc-empty';
  box.innerHTML =
    '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' +
    '<path d="M4 5a2 2 0 0 1 2-2h6l6 6v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M12 3v6h6"/></svg>';
  const t = document.createElement('span');
  t.textContent = title;
  box.append(t);
  if (detail) {
    const s = document.createElement('span');
    s.className = 'small';
    s.textContent = detail;
    box.append(s);
  }
  return box;
}

/* Esqueleto de carga con el componente .placeholder de Bootstrap */
function skeleton() {
  const wrap = document.createElement('div');
  wrap.className = 'doc-skeleton placeholder-glow';
  ['col-8', 'col-10', 'col-6'].forEach((width) => {
    const bar = document.createElement('span');
    bar.className = 'placeholder ' + width;
    wrap.append(bar);
  });
  return wrap;
}

/* --------------------------------------------------------------- documentos */
function visibleDocuments() {
  const term = (el('doc-filter')?.value || '').trim().toLowerCase();
  const sort = el('doc-sort')?.value || 'name';
  let list = state.documents.slice();
  if (term) list = list.filter((d) => String(d.name || '').toLowerCase().includes(term));
  if (sort === 'modified') list.sort((a, b) => String(b.modified_time || '').localeCompare(String(a.modified_time || '')));
  else if (sort === 'type') list.sort((a, b) => fileKind(a.mime_type).localeCompare(fileKind(b.mime_type)) || String(a.name || '').localeCompare(String(b.name || '')));
  else list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  return list;
}

function renderDocuments(animate = false) {
  const box = el('documents');
  const list = visibleDocuments();
  el('doc-count').textContent = state.documents.length;
  box.replaceChildren();

  if (!state.documents.length) {
    box.append(emptyState('Sin documentos indexados.', 'Usa «Sincronizar desde Drive» para comenzar.'));
    return;
  }
  if (!list.length) {
    box.append(emptyState('Sin coincidencias.', 'Prueba con otro término de búsqueda.'));
    return;
  }

  list.forEach((doc, i) => {
    const row = document.createElement('div');
    row.className = 'doc-item' + (animate ? ' fade-in' : '');
    if (animate) row.style.animationDelay = Math.min(i * 20, 200) + 'ms';

    const badge = document.createElement('span');
    const kind = fileKind(doc.mime_type);
    badge.className = 'file-badge file-badge--' + kind.toLowerCase();
    badge.textContent = kind;

    const a = document.createElement('a');
    a.className = 'text-truncate';
    a.textContent = doc.name || '(sin nombre)';
    a.title = doc.name || '';
    const href = linkFor(doc);
    if (href) {
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    } else {
      a.removeAttribute('href');
    }
    row.append(badge, a);

    const meta = formatDate(doc.modified_time);
    if (meta) {
      const m = document.createElement('span');
      m.className = 'doc-meta';
      m.textContent = meta;
      row.append(m);
    }
    box.append(row);
  });
}

async function loadDocuments(animate = true) {
  const cached = cachedDocuments();
  if (cached && cached.documents.length) {
    // Pintado inmediato con la última lista vista; se refresca en segundo plano.
    state.documents = cached.documents;
    renderDocuments(false);
    applyDocNote(cached.source);
  } else {
    el('documents').replaceChildren(skeleton());
  }
  try {
    const r = await api.documents();
    state.documents = r.documents || [];
    cacheDocuments({ documents: state.documents, source: r.source });
    renderDocuments(!cached && animate);
    applyDocNote(r.source);
  } catch (e) {
    // Con caché disponible se conserva la vista previa y no se interrumpe al usuario.
    if (!cached || !cached.documents.length) throw e;
  }
}

function applyDocNote(source) {
  const note = el('doc-note');
  if (note) {
    note.textContent = source === 'vector_store'
      ? 'Recuperados desde el índice en OpenAI (sin historial local).'
      : 'Archivos indexados desde una carpeta autorizada de Google Drive.';
  }
}

function cachedDocuments() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.documents);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.documents) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function cacheDocuments(payload) {
  try { sessionStorage.setItem(STORAGE_KEYS.documents, JSON.stringify(payload)); } catch (_) {}
}

/* ------------------------------------------------------------------ consulta */
function sourceKey(source) {
  const url = String(source?.url || '').trim();
  return url || String(source?.name || '').trim().toLowerCase();
}

function dedupeSources(list) {
  const seen = new Set();
  return (list || []).filter((source) => {
    if (!source) return false;
    const key = sourceKey(source);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderSources(sources, retrieved = []) {
  const list = el('sources');
  list.replaceChildren();
  const title = el('sources-title');
  const count = el('source-count');

  const cited = dedupeSources(sources);
  const citedKeys = new Set(cited.map(sourceKey));
  // Solo se muestran como consultados los que no fueron citados ya.
  const consulted = dedupeSources(retrieved).filter((s) => {
    const key = sourceKey(s);
    return key && !citedKeys.has(key);
  });
  const shown = cited.length ? cited : consulted;
  const kind = cited.length ? 'cited' : 'consulted';
  const sectionLabel = cited.length || !consulted.length
    ? 'Fuentes verificables'
    : 'Documentos consultados';

  if (title) title.textContent = sectionLabel;
  if (count) {
    count.textContent = String(shown.length);
    count.setAttribute('aria-label', cited.length ? 'Fuentes citadas' : 'Documentos consultados');
  }
  list.setAttribute('aria-label', cited.length ? 'Fuentes citadas' : 'Documentos consultados');

  if (!shown.length) {
    const li = document.createElement('li');
    li.className = 'list-group-item px-0 text-body-secondary';
    li.textContent = 'No se recibieron citas verificables para esta respuesta.';
    list.append(li);
    return;
  }

  if (kind === 'consulted') {
    const note = document.createElement('li');
    note.className = 'list-group-item px-0 text-body-secondary small';
    note.textContent = 'El modelo no citó fragmentos concretos, pero consultó estos documentos:';
    list.append(note);
  }

  shown.forEach((source, i) => {
    const li = document.createElement('li');
    li.className = 'list-group-item px-0 fade-in';
    li.style.animationDelay = Math.min(i * 25, 200) + 'ms';

    const idx = document.createElement('span');
    idx.className = 'source-index';
    idx.textContent = String(i + 1);

    const href = linkFor(source);
    const name = document.createElement(href ? 'a' : 'span');
    name.textContent = source.name || '(fuente)';
    if (href) {
      name.href = href;
      name.target = '_blank';
      name.rel = 'noopener noreferrer';
    }
    li.append(idx, name);
    list.append(li);
  });
}

/* ----------------------------------------------- formato de la respuesta y ayuda */
function appendInline(node, text) {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) node.append(document.createTextNode(text.slice(last, match.index)));
    const token = match[0];
    if (token.startsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = token.slice(2, -2);
      node.append(strong);
    } else {
      const code = document.createElement('code');
      code.textContent = token.slice(1, -1);
      node.append(code);
    }
    last = match.index + token.length;
  }
  if (last < text.length) node.append(document.createTextNode(text.slice(last)));
}

/* Convierte la respuesta (texto plano) en párrafos, listas, títulos y negritas. */
function renderAnswer(text) {
  const box = el('answer');
  box.replaceChildren();
  box.removeAttribute('aria-busy');
  if (!text) {
    box.textContent = 'Sin respuesta.';
    return;
  }
  let list = null;
  let paragraph = [];
  const flushList = () => {
    if (list) { box.append(list); list = null; }
  };
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const p = document.createElement('p');
    p.className = 'answer-p';
    appendInline(p, paragraph.join(' '));
    box.append(p);
    paragraph = [];
  };

  text.replace(/\r/g, '').split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) { flushParagraph(); flushList(); return; }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      flushParagraph();
      const h = document.createElement('h3');
      h.className = 'answer-h';
      appendInline(h, heading[2]);
      box.append(h);
      return;
    }

    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (!list || list.dataset.ordered !== String(ordered)) {
        flushList();
        list = document.createElement(ordered ? 'ol' : 'ul');
        list.className = 'answer-list';
        list.dataset.ordered = String(ordered);
      }
      const li = document.createElement('li');
      appendInline(li, (bullet || numbered)[1]);
      list.append(li);
      return;
    }

    flushList();
    paragraph.push(line);
  });
  flushList();
  flushParagraph();
}

function setAnswerThinking(on) {
  const box = el('answer');
  if (!on) {
    box.removeAttribute('aria-busy');
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'answer-thinking';
  const spinner = document.createElement('span');
  spinner.className = 'spinner-border spinner-border-sm me-2';
  spinner.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = 'Buscando en los documentos…';
  wrap.append(spinner, text);
  box.replaceChildren(wrap);
  box.setAttribute('aria-busy', 'true');
}

function clearAnswer() {
  state.lastAnswer = '';
  el('answer').replaceChildren();
  el('sources').replaceChildren();
  const title = el('sources-title');
  if (title) title.textContent = 'Fuentes verificables';
  const count = el('source-count');
  if (count) count.textContent = '0';
  const copy = el('copy-answer');
  if (copy) copy.disabled = true;
  setMessage('');
}

const EXAMPLES = [
  '¿Qué se recomienda para reparar laptops?',
  'Resume las ideas principales sobre inteligencia artificial.',
  '¿Qué pasos sigue el desensamble de una laptop?',
];

function renderExamples() {
  const box = el('examples');
  if (!box) return;
  box.replaceChildren();
  EXAMPLES.forEach((question) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'btn btn-outline-primary btn-sm focus-ring';
    chip.textContent = question;
    chip.addEventListener('click', () => {
      const input = el('question');
      input.value = question;
      input.classList.remove('is-invalid');
      updateCharCount();
      input.focus();
    });
    box.append(chip);
  });
}

async function ask() {
  const q = el('question').value.trim();
  if (q.length < 3) {
    el('question').classList.add('is-invalid');
    setMessage('Escribe una pregunta de al menos 3 caracteres.', true);
    el('question').focus();
    return;
  }
  el('question').classList.remove('is-invalid');

  const useSearch = el('use-search').checked;
  const button = el('ask');
  setLoading(button, true, 'Consultando…');
  setMessage('Consultando al agente…');
  setAnswerThinking(true);
  try {
    const data = await api.ask(q, useSearch);
    state.lastAnswer = data.answer || '';
    writeStore(localStorage, STORAGE_KEYS.question, q);
    renderAnswer(state.lastAnswer);
    const sources = data.sources || [];
    const retrieved = data.retrieved || [];
    renderSources(sources, retrieved);
    const copy = el('copy-answer');
    if (copy) copy.disabled = !state.lastAnswer;
    if (useSearch && !sources.length && retrieved.length) {
      setMessage('Consulta finalizada. El modelo no citó fragmentos concretos; abajo se listan los documentos que consultó.');
    } else if (useSearch && !sources.length) {
      setMessage('Consulta finalizada. No se citaron documentos. Revisa la respuesta: el agente puede haber hecho una pregunta de aclaración para buscar mejor.');
    } else {
      setMessage('Consulta finalizada.');
    }
  } catch (e) {
    el('answer').replaceChildren();
    const copy = el('copy-answer');
    if (copy) copy.disabled = true;
    setMessage(e.message, true);
    notify(e.message, 'danger');
  } finally {
    el('answer').removeAttribute('aria-busy');
    setLoading(button, false);
  }
}

async function sync() {
  if (!confirm('¿Sincronizar archivos de la carpeta autorizada de Google Drive?\n\nPuede tardar hasta un minuto; no cierres la página.')) return;
  const button = el('sync');
  setLoading(button, true, 'Sincronizando…');
  setMessage('Sincronizando documentos…');
  const started = Date.now();
  const timer = setInterval(() => {
    const secs = Math.round((Date.now() - started) / 1000);
    setLoadingLabel(button, `Sincronizando… ${secs} s`);
    setMessage(`Sincronizando documentos… ${secs} s (puede tardar hasta un minuto).`);
  }, 1000);
  try {
    const r = await api.sync();
    await loadDocuments();
    const stats = r.stats || { added: 0, updated: 0, removed: 0, unchanged: 0, errors: [] };
    const errores = (stats.errors || []).length;
    const summary = `Sincronización: ${stats.added} nuevos, ${stats.updated} actualizados, ${stats.removed} eliminados, ${stats.unchanged} sin cambios. Errores: ${errores}.`;
    setMessage(summary);
    notify(summary, errores ? 'danger' : 'success');
  } catch (e) {
    setMessage(e.message, true);
    notify(e.message, 'danger');
  } finally {
    clearInterval(timer);
    setLoading(button, false);
  }
}

/* ---------------------------------------------------------------- utilidades */
function updateCharCount() {
  const q = el('question');
  const out = el('char-count');
  if (!out) return;
  const max = Number(q.maxLength) || 3000;
  out.textContent = `${q.value.length} / ${max}`;
  out.classList.toggle('is-near', q.value.length >= max * 0.9);
}

async function copyAnswer() {
  if (!state.lastAnswer) return;
  const button = el('copy-answer');
  try {
    await navigator.clipboard.writeText(state.lastAnswer);
    button.textContent = 'Copiado';
    notify('Respuesta copiada al portapapeles.');
    setTimeout(() => {
      button.textContent = 'Copiar';
    }, 1500);
  } catch (_) {
    setMessage('No se pudo copiar al portapapeles.', true);
  }
}

function onKeydown(e) {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;

  if (e.key === '/' && !typing) {
    e.preventDefault();
    el('question').focus();
  } else if (e.key === 'Escape') {
    el('question').value = '';
    el('question').classList.remove('is-invalid');
    writeStore(localStorage, STORAGE_KEYS.question, '');
    updateCharCount();
    setMessage('');
  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    ask();
  }
}

/* ------------------------------------------------------------------ arranque */
// Restaura la última consulta y las preferencias de la lista.
const savedQuestion = readStore(localStorage, STORAGE_KEYS.question);
if (savedQuestion) el('question').value = savedQuestion;
const savedFilter = readStore(localStorage, STORAGE_KEYS.filter);
if (savedFilter && el('doc-filter')) el('doc-filter').value = savedFilter;
const savedSort = readStore(localStorage, STORAGE_KEYS.sort);
if (savedSort && el('doc-sort')) el('doc-sort').value = savedSort;

const persistQuestion = debounce(
  () => writeStore(localStorage, STORAGE_KEYS.question, el('question').value.trim()),
  300
);
const persistFilter = debounce(
  (value) => writeStore(localStorage, STORAGE_KEYS.filter, value),
  250
);
const renderFiltered = debounce(() => renderDocuments(false), 150);

el('ask').addEventListener('click', ask);
el('sync').addEventListener('click', sync);
el('question').addEventListener('input', () => {
  el('question').classList.remove('is-invalid');
  updateCharCount();
  persistQuestion();
});
el('doc-filter')?.addEventListener('input', (event) => {
  persistFilter(event.target.value);
  renderFiltered();
});
el('doc-sort')?.addEventListener('change', (event) => {
  writeStore(localStorage, STORAGE_KEYS.sort, event.target.value);
  renderDocuments(false);
});
el('copy-answer')?.addEventListener('click', copyAnswer);
el('clear-answer')?.addEventListener('click', clearAnswer);
document.addEventListener('keydown', onKeydown);
renderExamples();

// Red de seguridad: cualquier promesa rechazada sin capturar se informa al usuario.
window.addEventListener('unhandledrejection', (event) => {
  const msg = (event.reason && (event.reason.message || event.reason)) || 'Error inesperado.';
  setMessage(String(msg), true);
  notify(String(msg), 'danger');
});

updateCharCount();
api
  .health()
  .then((r) => {
    const node = el('health');
    node.textContent = r.configured ? 'Servicio en línea' : 'Configuración pendiente';
    node.title = r.configured
      ? 'El servicio responde y hay clave de OpenAI y carpeta de Drive configuradas.'
      : 'Falta OPENAI_API_KEY o GOOGLE_DRIVE_FOLDER_ID en el servidor.';
    node.classList.add(r.configured ? 'is-ready' : 'is-offline');
  })
  .catch(() => {
    const node = el('health');
    node.textContent = 'Sin conexión';
    node.title = 'No se pudo contactar con el servicio.';
    node.classList.add('is-offline');
  });
loadDocuments().catch((e) => {
  setMessage(e.message, true);
  notify(e.message, 'danger');
});
