// Sound on/off button, bottom right. The icon is static markup, not visitor text.

import { h } from './dom.js';

const SPEAKER = '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/>';
const WAVES = '<path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
const CROSS = '<path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';

export function createSoundToggle(root, { muted, onChange }) {
  const button = h('button', { type: 'button', class: 'btn btn-dark icon-only' });
  root.append(h('div', { class: 'corner-bottom-right' }, button));

  function render() {
    button.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">${SPEAKER}${muted ? CROSS : WAVES}</svg>`;
    button.setAttribute('aria-label', muted ? 'Sound is off. Turn sound on' : 'Sound is on. Turn sound off');
    button.setAttribute('aria-pressed', String(muted));
    button.title = muted ? 'Sound off' : 'Sound on';
  }
  button.addEventListener('click', () => {
    muted = !muted;
    render();
    onChange(muted);
  });
  render();
}
