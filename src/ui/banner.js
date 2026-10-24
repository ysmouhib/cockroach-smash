// A message that stays at the top of the screen while a problem lasts (offline,
// database paused), unlike the toast, which fades after a few seconds.

import { h } from './dom.js';

export function createBanner(root) {
  const text = h('p', { class: 'banner-text' });
  const action = h('button', { type: 'button', class: 'btn btn-small btn-plain', hidden: true });
  const el = h('div', { class: 'banner', role: 'alert', hidden: true }, text, action);
  root.append(el);
  let current = null;
  let onAction = null;
  action.addEventListener('click', () => onAction?.());

  return {
    // `key` names the problem, so hide(key) only clears that one.
    show(key, message, button) {
      current = key;
      text.textContent = message;
      action.hidden = !button;
      if (button) { action.textContent = button.label; onAction = button.onClick; }
      el.hidden = false;
    },
    hide(key) {
      if (key && key !== current) return;
      current = null;
      el.hidden = true;
    },
    get current() { return current; },
  };
}
