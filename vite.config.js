import { defineConfig, loadEnv } from 'vite';

// GitHub Pages serves the site at https://<user>.github.io/<repo>/, so the built
// files need that prefix. In GitHub Actions the repo name comes from
// GITHUB_REPOSITORY; a local `npm run build` assumes it is called cockroach-smash.
// A repo named <user>.github.io is served from the root instead.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'cockroach-smash';
const base = repo.endsWith('.github.io') ? '/' : `/${repo}/`;

// GitHub Pages can't send security headers, so the built page carries its
// Content-Security-Policy as a meta tag: scripts only from this site, network
// only to this site and the Supabase project. Not in dev (Vite's dev server
// injects its own scripts).
function contentSecurityPolicy(supabaseUrl) {
  const connect = ["'self'"];
  if (supabaseUrl) {
    const u = new URL(supabaseUrl);
    connect.push(u.origin, `${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}`);
  }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

// The build and `npm run preview` use the prefix; `npm run dev` stays at http://localhost:5173/.
export default defineConfig(({ command, mode, isPreview }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  return {
    base: command === 'build' || isPreview ? base : '/',
    plugins: [contentSecurityPolicy(env.VITE_SUPABASE_URL)],
  };
});
