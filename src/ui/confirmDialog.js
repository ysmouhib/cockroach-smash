// A small yes/no dialog. confirm() resolves true on yes, false on cancel,
// Escape or a click on the backdrop. Focus starts on Cancel, the safe choice,
// and goes back to where it was when the dialog closes.

import { h, trapTab } from './dom.js';

export function createConfirmDialog(root) {
  const message = h('p', { id: 'confirm-message', class: 'confirm-message' });
  const yes = h('button', { type: 'button', class: 'btn btn-red' });
  const no = h('button', { type: 'button', class: 'btn btn-plain', text: 'Cancel' });
  const box = h('div', { class: 'modal confirm', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'confirm-message' },
    message, h('div', { class: 'confirm-buttons' }, no, yes));
  const backdrop = h('div', { class: 'modal-backdrop', hidden: true }, box);
  root.append(backdrop);

  let resolve = null;
  let returnFocus = null;

  function finish(answer) {
    if (!resolve) return;
    backdrop.hidden = true;
    resolve(answer);
    resolve = null;
    returnFocus?.focus();
  }

  yes.addEventListener('click', () => finish(true));
  no.addEventListener('click', () => finish(false));
  backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) finish(false); });
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
    trapTab(box, e);
  });

  return function confirm(text, confirmLabel) {
    finish(false); // a newer question replaces an open one
    message.textContent = text;
    yes.textContent = confirmLabel;
    returnFocus = document.activeElement;
    backdrop.hidden = false;
    no.focus();
    return new Promise((r) => { resolve = r; });
  };
}
