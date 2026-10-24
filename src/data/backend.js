// Picks the backend from the environment (see .env.example):
//   VITE_BACKEND=fake      in-memory fake, nothing leaves the browser
//   VITE_BACKEND=supabase  the real one; needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
// Without VITE_BACKEND, Supabase is used when both of those are set, else the fake.

import { createFakeBackend, BackendError } from './fakeBackend.js';

// New-style secret keys, or a legacy JWT key whose role is service_role.
export function isSecretKey(key) {
  if (key.startsWith('sb_secret_')) return true;
  if (!key.startsWith('eyJ')) return false;
  try {
    const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))).role === 'service_role';
  } catch {
    return false;
  }
}

export async function connectBackend() {
  const env = import.meta.env;
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const choice = env.VITE_BACKEND || (url && key ? 'supabase' : 'fake');

  if (choice === 'fake') return createFakeBackend();
  if (choice !== 'supabase') throw new BackendError('config', `Unknown VITE_BACKEND "${choice}". Use "fake" or "supabase".`);
  if (!url || !key) throw new BackendError('config', 'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set.');
  if (isSecretKey(key)) {
    // A secret key bypasses every database rule and must never reach a browser.
    throw new BackendError('config', 'That is the secret key. Use the publishable key (sb_publishable_…).');
  }
  // Loaded only when needed, so the fake build doesn't ship supabase-js.
  const { createSupabaseBackend } = await import('./supabaseBackend.js');
  return createSupabaseBackend({ url, key });
}
