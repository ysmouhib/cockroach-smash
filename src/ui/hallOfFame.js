// Small "Hall of fame" button (bottom left) and the side panel it opens: one card
// per exterminated cockroach, newest first, 30 at a time with "Show more".

import { h, closeOnOutsidePointer } from './dom.js';

const PAGE = 30;
const dateFormat = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' });

export function createHallOfFame(root, { backend }) {
  const button = h('button', {
    type: 'button', class: 'btn btn-small btn-dark', text: 'Hall of fame', 'aria-expanded': 'false', 'aria-controls': 'hall-panel',
  });
  const closeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close the Hall of fame', text: '×' });
  const list = h('ol', { class: 'hall-list' });
  const status = h('p', { class: 'hall-status', role: 'status' });
  const more = h('button', { type: 'button', class: 'btn btn-plain btn-small', text: 'Show more', hidden: true });
  const panel = h('aside', { id: 'hall-panel', class: 'side-panel', 'aria-labelledby': 'hall-title', tabindex: '-1', hidden: true },
    h('header', { class: 'side-header' }, h('h2', { id: 'hall-title', text: 'Hall of fame' }), closeBtn),
    h('p', { class: 'hint', text: 'Cockroaches finished off by ten different people.' }),
    list, status, more);
  const wrap = h('div', { class: 'hall' }, h('div', { class: 'corner-bottom-left' }, button), panel);
  root.append(wrap);

  let loaded = 0;
  let loading = false;
  let generation = 0; // ignores answers to requests made before a reload

  const isOpen = () => !panel.hidden;

  function card(entry) {
    return h('li', { class: 'hall-card' },
      h('blockquote', { text: entry.complaint }),
      h('p', { class: 'hall-owner', text: `${entry.owner_name} complained` }),
      h('p', { class: 'hall-meta' },
        h('span', { text: `Finished by ${entry.finisher_name || 'Anonymous'}` }),
        h('time', { datetime: new Date(entry.exterminated_at).toISOString(), text: dateFormat.format(entry.exterminated_at) })));
  }

  async function load(reset) {
    if (loading && !reset) return;
    const gen = reset ? ++generation : generation;
    if (reset) { loaded = 0; list.replaceChildren(); }
    loading = true;
    more.hidden = true;
    status.textContent = 'Loading…';
    try {
      const entries = await backend.hall_of_fame(PAGE, loaded);
      if (gen !== generation) return;
      list.append(...entries.map(card));
      loaded += entries.length;
      more.hidden = entries.length < PAGE;
      status.textContent = loaded === 0 ? 'No cockroach has been finished yet. It takes ten different people smashing the same one.' : '';
    } catch {
      if (gen !== generation) return;
      status.textContent = "Couldn't load the Hall of fame. Close it and try again.";
    } finally {
      if (gen === generation) loading = false;
    }
  }

  function open() {
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    panel.focus();
    load(true);
  }

  function close({ refocus = true } = {}) {
    if (!isOpen()) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
  }

  button.addEventListener('click', () => (isOpen() ? close() : open()));
  closeBtn.addEventListener('click', () => close());
  more.addEventListener('click', async () => {
    const first = loaded;
    await load(false);
    list.children[first]?.querySelector('blockquote')?.setAttribute('tabindex', '-1');
    list.children[first]?.querySelector('blockquote')?.focus(); // keep the keyboard where the new cards start
  });
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { e.stopPropagation(); close(); }
  });
  closeOnOutsidePointer(wrap, isOpen, () => close({ refocus: false }));

  return {
    close,
    // A cockroach was just finished: show it if the panel is open.
    refresh() { if (isOpen()) load(true); },
  };
}
