// Cloudflare Turnstile, so bots can't create anonymous users in bulk. Only used
// when VITE_TURNSTILE_SITE_KEY is set, and only for a browser's first sign-in
// (returning visitors keep their session). Mostly invisible: a box appears only
// when Cloudflare wants a person to tick it.

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TIMEOUT_MS = 60_000;

let scriptLoading = null;

function loadScript() {
  scriptLoading ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load')));
    script.onerror = () => { scriptLoading = null; reject(new Error('Turnstile did not load')); };
    document.head.append(script);
  });
  return scriptLoading;
}

// Resolves with a one-time token for Supabase's sign-in.
export async function getCaptchaToken(siteKey) {
  const turnstile = await loadScript();
  const box = document.createElement('div');
  box.className = 'captcha';
  document.body.append(box);
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Turnstile timed out')), TIMEOUT_MS);
      const fail = () => { clearTimeout(timer); reject(new Error('Turnstile failed')); };
      turnstile.render(box, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        callback: (token) => { clearTimeout(timer); resolve(token); },
        'error-callback': fail,
        'timeout-callback': fail,
      });
    });
  } finally {
    box.remove();
  }
}
