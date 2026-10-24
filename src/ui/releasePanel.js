// Red "Release a cockroach" button (top left) with the "1/2" badge, and the
// panel under it: the release form, or "Your cockroaches" with Self-destruct
// once the limit is reached.

import { h, charCount, closeOnOutsidePointer, focusables } from './dom.js';
import { loadPref, savePref, loadJSONPref, saveJSONPref } from '../data/prefs.js';

const NAME_MAX = 24;
const COMPLAINT_MAX = 280;
const MAX_LIVING = 2;
const KEEP_COMPLAINTS = 20; // own complaints remembered locally for "Your cockroaches"

// `getMine()` returns the visitor's living cockroach rows, oldest first.
// `reportError(err)` shows connection problems (offline, paused) where they belong.
export function createReleasePanel(root, { backend, getMine, confirm, reportError }) {
  let name = loadPref('name', '');
  let editingName = !name;
  let busy = false;
  let listKey = ''; // what the "Your cockroaches" list currently shows

  // --- Button and badge ---
  const badge = h('span', { class: 'badge', 'aria-hidden': 'true' });
  const button = h('button', {
    type: 'button', class: 'btn btn-red', 'aria-expanded': 'false', 'aria-controls': 'release-panel',
  }, h('span', { text: 'Release a cockroach' }), badge);

  // --- Form ---
  const nameInput = h('input', { id: 'release-name', type: 'text', autocomplete: 'nickname', placeholder: 'Your name', 'aria-describedby': 'release-error' });
  const nameField = h('div', { class: 'field' }, h('label', { for: 'release-name', text: 'Your name' }), nameInput);
  const nameShown = h('strong');
  const changeName = h('button', { type: 'button', class: 'link', text: 'Change', 'aria-label': 'Change your name' });
  const nameLine = h('p', { class: 'as-name' }, 'Releasing as ', nameShown, ' · ', changeName);
  const complaint = h('textarea', {
    id: 'release-complaint', rows: 4, placeholder: "What's bugging you?", 'aria-describedby': 'release-count release-hint release-error',
  });
  const counter = h('span', { id: 'release-count', class: 'counter' });
  const error = h('p', { id: 'release-error', class: 'form-error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn-red', text: 'Release' });
  const form = h('form', { class: 'release-form', novalidate: true },
    nameField, nameLine,
    h('div', { class: 'field' },
      h('div', { class: 'label-row' }, h('label', { for: 'release-complaint', text: 'Your complaint' }), counter),
      complaint,
      h('p', { id: 'release-hint', class: 'hint', text: 'Enter to release · Shift+Enter for a new line' })),
    error,
    h('div', { class: 'form-actions' }, submit));

  // --- Your cockroaches ---
  const list = h('ul', { class: 'mine-list' });
  const mineSection = h('section', { class: 'mine', 'aria-labelledby': 'mine-title' },
    h('h2', { id: 'mine-title', text: 'Your cockroaches' }),
    h('p', { class: 'hint', text: `You can have ${MAX_LIVING} out at once. Self-destruct one to release another.` }),
    list);

  const panel = h('div', { id: 'release-panel', class: 'dropdown dropdown-left release-panel', role: 'dialog', 'aria-label': 'Release a cockroach', hidden: true },
    form, mineSection);
  const wrap = h('div', { class: 'corner corner-left' }, button, panel);
  root.append(wrap);

  const isOpen = () => !panel.hidden;

  function open() {
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    listKey = '';
    render();
    focusFirst();
  }

  function close({ refocus = true } = {}) {
    if (!isOpen()) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
  }

  function focusFirst() {
    if (!form.hidden) (editingName ? nameInput : complaint).focus();
    else focusables(list)[0]?.focus();
  }

  button.addEventListener('click', () => (isOpen() ? close() : open()));
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { e.stopPropagation(); close(); }
  });
  closeOnOutsidePointer(wrap, isOpen, () => close({ refocus: false }));

  // --- Name ---
  function renderName() {
    nameField.hidden = !editingName;
    nameLine.hidden = editingName;
    nameShown.textContent = name;
    if (editingName && !nameInput.value) nameInput.value = name;
  }
  changeName.addEventListener('click', () => {
    editingName = true;
    renderName();
    nameInput.focus();
    nameInput.select();
  });

  // --- Complaint counter and keys ---
  function renderCounter() {
    const left = COMPLAINT_MAX - charCount(complaint.value.trim());
    counter.textContent = left >= 0 ? `${left} left` : `${-left} too many`;
    counter.classList.toggle('over', left < 0);
  }
  complaint.addEventListener('input', () => { renderCounter(); error.textContent = ''; });
  nameInput.addEventListener('input', () => { error.textContent = ''; });
  complaint.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  // --- Submit ---
  function check() {
    const n = charCount(nameInput.value.trim());
    const c = charCount(complaint.value.trim());
    if (editingName && n < 1) return [nameInput, 'Type your name. It shows under your cockroach.'];
    if (editingName && n > NAME_MAX) return [nameInput, `Your name is too long (${n}/${NAME_MAX} characters).`];
    if (c < 1) return [complaint, 'Write a complaint first.'];
    if (c > COMPLAINT_MAX) return [complaint, `Your complaint is too long (${c}/${COMPLAINT_MAX} characters).`];
    return null;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const problem = check();
    if (problem) {
      error.textContent = problem[1];
      problem[0].focus();
      return;
    }
    const useName = editingName ? nameInput.value.trim() : name;
    const text = complaint.value.trim();
    busy = true;
    submit.disabled = true;
    submit.textContent = 'Releasing…';
    try {
      const row = await backend.release_roach(useName, text);
      name = useName;
      savePref('name', name);
      editingName = false;
      rememberComplaint(row.id, text);
      complaint.value = '';
      error.textContent = '';
      close();
    } catch (err) {
      error.textContent = err.message || 'Could not release your cockroach. Try again.';
      if (err.code === 'limit_reached') render();
      if (['offline', 'paused', 'network'].includes(err.code)) reportError(err);
    } finally {
      busy = false;
      submit.disabled = false;
      submit.textContent = 'Release';
    }
  });

  // --- Own complaints, kept in this browser so the list can tell them apart ---
  function rememberComplaint(id, text) {
    const saved = loadJSONPref('my-complaints', []).filter((entry) => entry.id !== id);
    saved.unshift({ id, text });
    saveJSONPref('my-complaints', saved.slice(0, KEEP_COMPLAINTS));
  }

  function complaintOf(id) {
    return loadJSONPref('my-complaints', []).find((entry) => entry.id === id)?.text;
  }

  // --- Your cockroaches list ---
  function renderList(mine) {
    const key = mine.map((r) => `${r.id}:${r.smash_count}`).join('|');
    if (key === listKey) return;
    listKey = key;
    const focusedId = document.activeElement?.dataset?.roachId;
    list.replaceChildren(...mine.map((r, i) => {
      const text = complaintOf(r.id);
      const destruct = h('button', {
        type: 'button', class: 'btn btn-red btn-small', text: 'Self-destruct',
        'aria-label': `Self-destruct cockroach ${i + 1}`, 'data-roach-id': r.id,
      });
      destruct.addEventListener('click', () => selfDestruct(r.id, destruct));
      return h('li', { class: 'mine-item' },
        h('div', { class: 'mine-text' },
          h('p', { class: 'mine-complaint', text: text ? `“${text}”` : `Cockroach ${i + 1}` }),
          h('p', { class: 'mine-meta', text: `Smashed ${r.smash_count} of 10` })),
        destruct);
    }));
    if (focusedId) list.querySelector(`[data-roach-id="${CSS.escape(focusedId)}"]`)?.focus();
  }

  async function selfDestruct(id, btn) {
    const yes = await confirm('Self-destruct this cockroach? Its complaint will be lost.', 'Self-destruct');
    if (!yes) return;
    btn.disabled = true;
    try {
      await backend.self_destruct(id);
    } catch (err) {
      reportError(err);
      btn.disabled = false;
    }
  }

  // --- Render: badge always; panel contents while open ---
  function render() {
    const mine = getMine();
    badge.textContent = `${mine.length}/${MAX_LIVING}`;
    button.setAttribute('aria-label', `Release a cockroach (${mine.length} of ${MAX_LIVING} out)`);
    if (!isOpen() || busy) return; // mid-release: the panel closes once the server answers
    const full = mine.length >= MAX_LIVING;
    const wasList = form.hidden;
    form.hidden = full;
    mineSection.hidden = !full;
    if (full) renderList(mine);
    else { listKey = ''; renderName(); renderCounter(); }
    // The form came back after a self-destruct: move focus into it.
    if (wasList && !full) focusFirst();
  }

  render();
  return { refresh: render, close };
}
