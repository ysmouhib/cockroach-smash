// Small "About" link, bottom centre: the game doubles as a security testbed,
// explained in the repository's README.

import { h } from './dom.js';

export const ABOUT_URL = 'https://github.com/ysmouhib/cockroach-smash#readme';

export function createAboutLink(root) {
  root.append(h('a', {
    class: 'about-link',
    href: ABOUT_URL,
    target: '_blank',
    rel: 'noopener noreferrer',
    'aria-label': 'About this experiment (opens GitHub)',
    title: 'A game used as a testbed for invisible-prompt defenses (opens GitHub)',
  }, h('span', { class: 'about-long', text: 'About this experiment' }), h('span', { class: 'about-short', text: 'About' })));
}
