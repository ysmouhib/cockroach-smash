// Short message at the top of the screen, e.g. "Too slow, someone got it first".

export function createToast(root) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  root.append(el);
  let timer = 0;
  return {
    show(text, ms = 2500) {
      el.textContent = text;
      el.classList.add('visible');
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('visible'), ms);
    },
  };
}
