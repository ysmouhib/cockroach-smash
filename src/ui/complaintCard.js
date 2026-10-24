// The card next to a splat: "<Owner> complained:", the text, "Smashed 4 of 10".
// Closes on click or after 10 seconds. Visitor text only ever goes in via textContent.

const SHOW_MS = 10_000;
const GAP = 48; // px between the splat centre and the card

export function createComplaintCard(root) {
  const card = document.createElement('div');
  card.className = 'complaint-card';
  card.hidden = true;
  card.setAttribute('role', 'status');
  const who = document.createElement('p');
  who.className = 'complaint-who';
  const owner = document.createElement('strong');
  who.append(owner, ' complained:');
  const text = document.createElement('p');
  text.className = 'complaint-text';
  const count = document.createElement('p');
  count.className = 'complaint-count';
  card.append(who, text, count);
  root.append(card);

  let timer = 0;
  function hide() {
    clearTimeout(timer);
    card.hidden = true;
  }
  card.addEventListener('click', hide);

  return {
    hide,
    show({ ownerName, complaint, smashCount, total, x, y }) {
      owner.textContent = ownerName;
      text.textContent = complaint;
      count.textContent = `Smashed ${smashCount} of ${total}`;
      card.hidden = false;
      // Beside the splat, on whichever side fits, kept inside the window.
      const w = card.offsetWidth, h = card.offsetHeight;
      let left = x + GAP;
      if (left + w > innerWidth - 12) left = x - GAP - w;
      left = Math.max(12, Math.min(innerWidth - w - 12, left));
      const top = Math.max(12, Math.min(innerHeight - h - 12, y - h / 2));
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
      clearTimeout(timer);
      timer = setTimeout(hide, SHOW_MS);
    },
  };
}
