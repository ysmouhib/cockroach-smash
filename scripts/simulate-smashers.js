#!/usr/bin/env node
// Checks the final-kill rule against the real Supabase project:
// signs in 10 anonymous users, releases a test cockroach, has all 10 smash it,
// verifies the 10th gets the final kill and the Hall of fame entry, checks
// that two smashes at the same instant count once, then deletes all test data.
//
// Usage (PowerShell):
//   $env:SUPABASE_SECRET_KEY = "sb_secret_..."   # this terminal only
//   node scripts/simulate-smashers.js            # add --real-wait to wait out each 30 s respawn
//   Remove-Item Env:SUPABASE_SECRET_KEY
//
// The project URL and publishable key come from the environment or .env
// (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY). The secret key is needed
// only to skip respawn waits and to delete the test data afterwards. It is read
// from the environment only: never put it in .env, the repo or GitHub.
// Uses 11 anonymous sign-ins; Supabase allows 30 per hour per IP by default.
// More in docs/SETUP.md.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const REAL_WAIT = process.argv.includes('--real-wait');
const SMASHERS = 10;
const RESPAWN_MS = 30_000;

// --- Settings ---

function readDotEnv() {
  const values = {};
  if (!existsSync('.env')) return values;
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) values[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return values;
}

const dotEnv = readDotEnv();
const url = process.env.VITE_SUPABASE_URL || dotEnv.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || dotEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY; // environment only, on purpose

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(2);
}
if (!url || !publishableKey) fail('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (in .env or the environment).');
if (!secretKey) fail('Set SUPABASE_SECRET_KEY in this terminal (see the top of this file). It is needed to delete the test data.');
if (dotEnv.SUPABASE_SECRET_KEY) fail('Remove SUPABASE_SECRET_KEY from .env: the secret key must never be stored in the project.');
if (secretKey.startsWith('sb_publishable_')) fail('SUPABASE_SECRET_KEY holds the publishable key; it needs the secret key.');

const clientOptions = (storageKey) => ({
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey },
});
const admin = createClient(url, secretKey, clientOptions('admin'));

// --- Reporting ---

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  return ok;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Calls a server function; returns { data } or { code, message }.
async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  return error ? { code: error.hint || error.code || 'error', message: error.message } : { data };
}

// --- Test data, tracked so it can always be deleted ---

const created = { users: [], roaches: [] };
const runId = randomUUID().slice(0, 8);

async function signIn(i) {
  const client = createClient(url, publishableKey, clientOptions(`sim-${runId}-${i}`));
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw new Error(`Anonymous sign-in ${i} failed: ${error.message}`);
  created.users.push(data.user.id);
  return { client, id: data.user.id };
}

async function respawn(roachId) {
  if (REAL_WAIT) { await sleep(RESPAWN_MS + 1000); return; }
  const { error } = await admin.from('roaches')
    .update({ dead_until: new Date(Date.now() - 1000).toISOString() })
    .eq('id', roachId);
  if (error) throw new Error(`Could not skip the respawn wait: ${error.message}`);
}

async function release(user, name, complaint) {
  const res = await rpc(user.client, 'release_roach', { p_name: name, p_complaint: complaint });
  if (res.data) created.roaches.push(res.data.id);
  return res;
}

async function cleanUp() {
  console.log('\nDeleting test data…');
  if (created.roaches.length) {
    // Deleting the cockroaches also deletes their complaints and smashes.
    const { error } = await admin.from('roaches').delete().in('id', created.roaches);
    check(`deleted ${created.roaches.length} test cockroach(es)`, !error, error?.message);
  }
  let usersLeft = 0;
  for (const id of created.users) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) usersLeft++;
  }
  check(`deleted ${created.users.length} anonymous test users`, usersLeft === 0, usersLeft ? `${usersLeft} could not be deleted` : '');
}

// --- The run ---

async function main() {
  console.log(`Project: ${url}   run: ${runId}${REAL_WAIT ? '   (waiting out real respawns, about 5 minutes)' : ''}\n`);
  const users = [];
  for (let i = 1; i <= SMASHERS; i++) users.push(await signIn(i));
  check(`${SMASHERS} anonymous users signed in`, new Set(users.map((u) => u.id)).size === SMASHERS);

  const complaint = `[simulate-smashers ${runId}] The test cockroach's secret complaint.`;
  const rel = await release(users[0], 'Test owner', complaint);
  if (!check('test cockroach released', !!rel.data, rel.message)) return;
  const roachId = rel.data.id;

  // Before any smash, nobody can read the complaint.
  const row = await users[1].client.from('roaches').select('*').eq('id', roachId).single();
  check('public row has no complaint', row.data && !JSON.stringify(row.data).includes('secret complaint'));
  const secrets = await users[1].client.from('roach_secrets').select('*').eq('roach_id', roachId);
  check('complaints table cannot be read', !!secrets.error || secrets.data.length === 0, secrets.error?.message);
  const write = await users[1].client.from('roaches').update({ smash_count: 9 }).eq('id', roachId).select();
  check('cockroaches cannot be changed directly', !!write.error || write.data.length === 0, write.error?.message);

  // Ten different smashers, one after the other.
  for (let i = 1; i <= SMASHERS; i++) {
    if (i > 1) await respawn(roachId);
    const res = await rpc(users[i - 1].client, 'smash', { p_roach_id: roachId });
    const s = res.data;
    const final = i === SMASHERS;
    check(`smasher ${i}: count ${i}${final ? ', final kill' : ''}`,
      s && s.smash_count === i && s.final === final && s.complaint === complaint,
      res.message || `count ${s?.smash_count}, final ${s?.final}`);
    if (i === 1) {
      const tooSoon = await rpc(users[1].client, 'smash', { p_roach_id: roachId });
      check('cannot be smashed while respawning', tooSoon.code === 'too_slow', tooSoon.code);
    }
    if (!s) return;
  }

  const after = await rpc(users[0].client, 'smash', { p_roach_id: roachId });
  check('nobody can smash it afterwards', after.code === 'gone', after.code);
  const status = await users[0].client.from('roaches').select('status, smash_count, finisher_name').eq('id', roachId).single();
  check('status is exterminated with 10 smashers', status.data?.status === 'exterminated' && status.data?.smash_count === SMASHERS, JSON.stringify(status.data));

  const winner = users[SMASHERS - 1];
  const signed = await rpc(winner.client, 'set_finisher_name', { p_roach_id: roachId, p_name: 'Test winner' });
  check('the 10th smasher can sign the Hall of fame', !signed.code, signed.message);
  const notWinner = await rpc(users[0].client, 'set_finisher_name', { p_roach_id: roachId, p_name: 'Impostor' });
  check('nobody else can sign it', notWinner.code === 'not_finisher', notWinner.code);

  const hof = await rpc(users[2].client, 'hall_of_fame', { p_limit: 30, p_offset: 0 });
  const entry = hof.data?.find((e) => e.roach_id === roachId);
  check('Hall of fame entry with complaint and winner', entry && entry.complaint === complaint && entry.finisher_name === 'Test winner' && entry.owner_name === 'Test owner',
    entry ? JSON.stringify({ owner: entry.owner_name, finisher: entry.finisher_name }) : hof.message || 'not found');

  // Two smashes at the same instant: one wins, the other is refused, the count goes up by one.
  const race = await release(users[1], 'Race owner', `[simulate-smashers ${runId}] race test`);
  if (check('second test cockroach released', !!race.data, race.message)) {
    const [a, b] = await Promise.all([
      rpc(users[2].client, 'smash', { p_roach_id: race.data.id }),
      rpc(users[3].client, 'smash', { p_roach_id: race.data.id }),
    ]);
    const wins = [a, b].filter((r) => r.data).length;
    const slow = [a, b].filter((r) => r.code === 'too_slow').length;
    const count = (await users[0].client.from('roaches').select('smash_count').eq('id', race.data.id).single()).data?.smash_count;
    check('two smashes at the same instant: one counts, one is too slow', wins === 1 && slow === 1 && count === 1, `${wins} won, ${slow} too slow, count ${count}`);
  }
}

try {
  await main();
} catch (err) {
  check('run completed', false, err.message);
} finally {
  await cleanUp();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
