// Per-browser preferences in localStorage. Storage can be blocked (private
// windows, strict settings), so every access falls back silently.

const PREFIX = 'cockroach-smash.';

export function loadPref(key, fallback) {
  try {
    const value = localStorage.getItem(PREFIX + key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function loadJSONPref(key, fallback) {
  try {
    const value = JSON.parse(loadPref(key, 'null'));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveJSONPref(key, value) {
  savePref(key, JSON.stringify(value));
}

export function savePref(key, value) {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Not saved; the choice still applies until the page is reloaded.
  }
}
