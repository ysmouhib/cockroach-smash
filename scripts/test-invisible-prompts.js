#!/usr/bin/env node
// Live attack test: fires every payload in tests/payloads.js at the deployed site,
// using only what the public page reveals (its Supabase URL and publishable key),
// exactly like an anonymous visitor would.
//
//   npm run test:live                       # the site in README.md
//   npm run test:live -- https://other.site/ # another deployment
//   npm run test:live -- --markdown          # also print a Markdown results table
//
// For each payload it releases a test cockroach, reads the stored text back the only
// legal way (smashing its own cockroach returns the complaint), checks it, then
// self-destructs the cockroach, which deletes the complaint. Left behind: one
// anonymous test user and some rows marked "self_destructed", invisible to players.
// No secret key is needed or used.

import { createClient } from '@supabase/supabase-js';
import { PAYLOADS, reveal } from '../tests/payloads.js';

const args = process.argv.slice(2);
const SITE = args.find((a) => a.startsWith('http')) || 'https://ysmouhib.github.io/cockroach-smash/';
const MARKDOWN = args.includes('--markdown');

// --- What the public page gives away ---
async function discover(site) {
  const html = await (await fetch(site)).text();
  const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => new URL(m[1], site).href);
  for (const src of scripts) {
    const js = await (await fetch(src)).text();
    const url = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
    const key = js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];
    if (url && key) return { url, key };
  }
  throw new Error(`No Supabase URL and publishable key found on ${site}`);
}

const rows = [];
let failed = 0;
function record(group, label, ok, detail) {
  if (!ok) failed++;
  rows.push({ group, label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

const { url, key } = await discover(SITE);
console.log(`Site: ${SITE}\nDatabase: ${url}\nKey seen by every visitor: ${key.slice(0, 18)}...\n`);
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: session, error: signInError } = await client.auth.signInAnonymously();
if (signInError) {
  console.error(`Anonymous sign-in failed: ${signInError.message}`);
  console.error('(With CAPTCHA switched on in Supabase, scripts cannot sign in; that is the point of it.)');
  process.exit(2);
}
console.log(`Signed in as anonymous visitor ${session.user.id.slice(0, 8)}...\n`);

// --- 1. Access control ---
for (const table of ['roach_secrets', 'smashes', 'profiles']) {
  const r = await client.from(table).select('*').limit(1);
  record('Access control', `${table} cannot be read`, !!r.error || r.data.length === 0, r.error?.message);
}
for (const [label, query] of [
  ['cockroaches cannot be inserted directly', () => client.from('roaches').insert({ owner_name: 'x', seed: 1 }).select()],
  ['cockroaches cannot be changed directly', () => client.from('roaches').update({ smash_count: 99 }).neq('status', 'none').select()],
  ['cockroaches cannot be deleted directly', () => client.from('roaches').delete().neq('status', 'none').select()],
]) {
  const r = await query();
  record('Access control', label, !!r.error || r.data.length === 0, r.error?.message);
}
for (const fn of ['_clean_text', '_clean_name', '_caller']) {
  const r = await client.rpc(fn, fn === '_clean_text' ? { p_text: 'x', p_multiline: true } : fn === '_clean_name' ? { p_name: 'x' } : {});
  record('Access control', `internal ${fn}() cannot be called`, !!r.error, r.error?.message?.slice(0, 50));
}

// --- 2. Every payload, through the real server functions ---
for (const p of PAYLOADS) {
  const name = p.field === 'name' ? p.input : 'Security test';
  const complaint = p.field === 'complaint' ? p.input : 'Security test complaint';
  const rel = await client.rpc('release_roach', { p_name: name, p_complaint: complaint });
  const label = `${p.id}: ${p.label}`;
  if (p.expect.refused) {
    record(p.family, label, rel.error?.hint === p.expect.refused, rel.error ? `refused: ${rel.error.hint}` : 'ACCEPTED');
    if (rel.data) await client.rpc('self_destruct', { p_roach_id: rel.data.id });
    continue;
  }
  if (rel.error) { record(p.family, label, false, `release failed: ${rel.error.message}`); continue; }
  let stored = rel.data.owner_name;
  if (p.field === 'complaint') {
    const sm = await client.rpc('smash', { p_roach_id: rel.data.id }); // smashing your own counts, and returns the complaint
    stored = sm.data?.complaint ?? `smash failed: ${sm.error?.message}`;
  }
  const ok = stored === p.expect.text;
  record(p.family, label, ok, ok ? '' : `stored ${reveal(stored).slice(0, 120)}`);
  const sd = await client.rpc('self_destruct', { p_roach_id: rel.data.id });
  if (sd.error) console.log(`      (cleanup: could not self-destruct ${rel.data.id}: ${sd.error.message})`);
}

console.log(`\n${rows.length - failed} passed, ${failed} failed`);
if (MARKDOWN) {
  console.log(`\n| Group | Check | Result |\n| --- | --- | --- |`);
  for (const r of rows) console.log(`| ${r.group} | ${r.label.replace(/\|/g, '/')} | ${r.ok ? 'pass' : 'FAIL'} |`);
}
process.exit(failed ? 1 : 0);
