// The winner's message after the 10th different smash, with an optional name
// field for the Hall of fame when the winner has no name yet.

import { trapTab } from './dom.js';

const NAME_MAX = 24;

export function createFinalMessage(root, { onSaveName }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.hidden = true;

  const box = document.createElement('div');
  box.className = 'modal final-message';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'final-title');

  const title = document.createElement('h2');
  title.id = 'final-title';
  title.textContent = 'You finished it!';
  const lead = document.createElement('p');
  lead.className = 'final-lead';
  lead.textContent = 'This cockroach is gone for good.';

  const quote = document.createElement('figure');
  quote.className = 'final-quote';
  const complaint = document.createElement('blockquote');
  const caption = document.createElement('figcaption');
  quote.append(complaint, caption);

  const count = document.createElement('p');
  count.className = 'final-count';

  const form = document.createElement('form');
  form.className = 'final-name';
  form.noValidate = true;
  const label = document.createElement('label');
  label.htmlFor = 'final-name-input';
  label.textContent = 'Add your name to the Hall of fame';
  const row = document.createElement('div');
  row.className = 'final-name-row';
  const input = document.createElement('input');
  input.id = 'final-name-input';
  input.type = 'text';
  input.autocomplete = 'nickname';
  input.placeholder = 'Your name';
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn btn-yellow btn-small';
  save.textContent = 'Save';
  row.append(input, save);
  const error = document.createElement('p');
  error.className = 'form-error';
  error.setAttribute('role', 'alert');
  form.append(label, row, error);

  const thanks = document.createElement('p');
  thanks.className = 'final-thanks';
  thanks.hidden = true;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn btn-plain';
  close.textContent = 'Close';

  box.append(title, lead, quote, count, form, thanks, close);
  backdrop.append(box);
  root.append(backdrop);

  let roachId = null;
  let busy = false;

  function hide() {
    backdrop.hidden = true;
  }
  close.addEventListener('click', hide);
  backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) hide(); });
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); hide(); }
    trapTab(box, e);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const name = input.value.trim();
    const n = Array.from(name).length;
    if (n < 1) { error.textContent = 'Type a name, or just close this.'; return; }
    if (n > NAME_MAX) { error.textContent = `That name is too long (${n}/${NAME_MAX} characters).`; return; }
    busy = true; save.disabled = true; error.textContent = '';
    try {
      await onSaveName(roachId, name);
      form.hidden = true;
      thanks.textContent = `Thanks, ${name}! You're in the Hall of fame.`;
      thanks.hidden = false;
      close.focus();
    } catch (err) {
      error.textContent = err.message || 'Could not save your name. Try again.';
    } finally {
      busy = false; save.disabled = false;
    }
  });

  return {
    hide,
    show({ id, ownerName, complaint: text, smashCount, needsName }) {
      roachId = id;
      complaint.textContent = text;
      caption.textContent = `${ownerName} complained`;
      count.textContent = `Smashed by ${smashCount} people`;
      form.hidden = !needsName;
      thanks.hidden = true;
      input.value = '';
      error.textContent = '';
      backdrop.hidden = false;
      (needsName ? input : close).focus();
    },
  };
}
