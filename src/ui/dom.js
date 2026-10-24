// Small DOM helpers shared by the panels.

// h('button', { class: 'btn', text: 'Go', onclick: fn, 'aria-label': 'Go' }, child, …)
// Strings set via `text` or as children become text nodes, never HTML.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el && !key.includes('-')) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}

// Counts characters like the server (Postgres char_length): code points, not UTF-16 units.
export function charCount(text) {
  return Array.from(text).length;
}

// Closes a popup on a pointerdown anywhere outside `inside`. Runs in the capture
// phase and stops the event, so the click that closes a panel doesn't also smash
// a cockroach. Clicks inside a modal dialog never count as outside.
export function closeOnOutsidePointer(inside, isOpen, close) {
  document.addEventListener('pointerdown', (e) => {
    if (!isOpen() || inside.contains(e.target) || e.target.closest?.('.modal-backdrop')) return;
    close();
    e.stopPropagation();
  }, true);
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

export function focusables(container) {
  return [...container.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
}

// Keeps Tab and Shift+Tab inside a modal dialog. Call from its keydown handler.
export function trapTab(container, e) {
  if (e.key !== 'Tab') return;
  const items = focusables(container);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
