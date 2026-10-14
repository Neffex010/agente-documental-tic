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
}

/* ------------------------------------------------------------------ consulta */
function renderSources(sources) {
  const list = el('sources');
  list.replaceChildren();
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

async function ask() {
  const q = el('question').value.trim();
  if (q.length < 3) {
    el('question').classList.add('is-invalid');
    setMessage('Escribe una pregunta de al menos 3 caracteres.', true);
    el('question').focus();
    return;
  }
  el('question').classList.remove('is-invalid');

  const button = el('ask');
  setLoading(button, true, 'Consultando…');
  setMessage('Consultando al agente…');
  try {
    const data = await api.ask(q, el('use-search').checked);
    state.lastAnswer = data.answer || '';
    el('answer').textContent = state.lastAnswer || 'Sin respuesta.';
    renderSources(data.sources || []);
    const copy = el('copy-answer');
    if (copy) copy.disabled = !state.lastAnswer;
    setMessage('Consulta finalizada.');
  } catch (e) {
    setMessage(e.message, true);
    notify(e.message, 'danger');
  } finally {
    setLoading(button, false);
  }
}

async function sync() {
  if (!confirm('¿Sincronizar archivos de la carpeta autorizada de Google Drive?')) return;
  const button = el('sync');
  setLoading(button, true, 'Sincronizando…');
  setMessage('Sincronizando documentos…');
  try {
    const r = await api.sync();
    await loadDocuments();
    const summary = `Sincronización: ${r.stats.added} nuevos, ${r.stats.updated} actualizados, ${r.stats.removed} eliminados, ${r.stats.unchanged} sin cambios. Errores: ${r.stats.errors.length}.`;
    setMessage(summary);
    notify(summary);
  } catch (e) {
    setMessage(e.message, true);
    notify(e.message, 'danger');
  } finally {
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
document.addEventListener('keydown', onKeydown);

updateCharCount();
api
  .health()
  .then((r) => {
    const node = el('health');
    node.textContent = r.configured ? 'Servidor local listo' : 'Configuración pendiente';
    node.classList.add(r.configured ? 'is-ready' : 'is-offline');
  })
  .catch(() => {
    const node = el('health');
    node.textContent = 'Sin conexión';
    node.classList.add('is-offline');
  });
loadDocuments().catch((e) => {
  setMessage(e.message, true);
  notify(e.message, 'danger');
});
