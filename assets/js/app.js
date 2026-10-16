import { ApiClient } from './api.js';

const api = new ApiClient();
const el = (id) => document.getElementById(id);

const state = { documents: [], lastAnswer: '' };

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
    badge.className = 'file-badge';
    badge.textContent = fileKind(doc.mime_type);

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
  el('documents').replaceChildren(skeleton());
  const r = await api.documents();
  state.documents = r.documents || [];
  renderDocuments(animate);
  const note = el('doc-note');
  if (note) {
    note.textContent = r.source === 'vector_store'
      ? 'Recuperados desde el índice en OpenAI (sin historial local).'
      : 'Archivos indexados desde una carpeta autorizada de Google Drive.';
  }
}

/* ------------------------------------------------------------------ consulta */
function renderSources(sources) {
  const list = el('sources');
  list.replaceChildren();
  const count = el('source-count');
  if (count) count.textContent = String(sources.length);
  if (!sources.length) {
    const li = document.createElement('li');
    li.className = 'list-group-item px-0 text-body-secondary';
    li.textContent = 'No se recibieron citas verificables para esta respuesta.';
    list.append(li);
    return;
  }
  sources.forEach((source, i) => {
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
  const count = el('source-count');
  if (count) count.textContent = '0';
  const copy = el('copy-answer');
  if (copy) copy.disabled = true;
  setMessage('');
}

const EXAMPLES = [
  '¿Qué se recomienda para reparar laptops?',
  'Resume las ideas principales sobre inteligencia artificial.',
  '¿Qué cuidados tiene una instalación eléctrica de interior?',
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
    renderAnswer(state.lastAnswer);
    const sources = data.sources || [];
    renderSources(sources);
    const copy = el('copy-answer');
    if (copy) copy.disabled = !state.lastAnswer;
    if (useSearch && !sources.length) {
      setMessage('Consulta finalizada. El modelo no citó documentos: reformula la pregunta o comprueba la búsqueda documental.');
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
    updateCharCount();
    setMessage('');
  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    ask();
  }
}

/* ------------------------------------------------------------------ arranque */
el('ask').addEventListener('click', ask);
el('sync').addEventListener('click', sync);
el('question').addEventListener('input', () => {
  el('question').classList.remove('is-invalid');
  updateCharCount();
});
el('doc-filter')?.addEventListener('input', () => renderDocuments(false));
el('doc-sort')?.addEventListener('change', () => renderDocuments(false));
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
