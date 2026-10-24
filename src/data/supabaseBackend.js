// The real backend: Supabase. Same interface as fakeBackend.js. Every browser
// signs in anonymously (one invisible user id per browser, kept across
// reloads by supabase-js), reads the public `roaches` table, calls the server
// functions from supabase/migrations/001_init.sql, and listens to Realtime.

import { createClient } from '@supabase/supabase-js';
import { BackendError } from './fakeBackend.js';
import { MESSAGES } from './messages.js';

const FLOOR_LIMIT = 500; // the floor shows at most the newest 150 anyway

// Postgres timestamps arrive as ISO strings from the API and as
// "2026-10-24 12:00:00.123456+00" from Realtime; Safari is strict about both.
export function parseTime(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const iso = String(value)
    .replace(' ', 'T')
    .replace(/\.(\d+)/, (_, digits) => `.${(digits + '00').slice(0, 3)}`) // exactly 3 digits
    .replace(/([+-]\d\d)$/, '$1:00');
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

// A `roaches` row as the game expects it: times in ms since the epoch.
function toRow(row) {
  return {
    ...row,
    seed: Number(row.seed),
    size: Number(row.size),
    tint: Number(row.tint),
    smash_count: Number(row.smash_count ?? 0),
    created_at: parseTime(row.created_at),
    dead_until: parseTime(row.dead_until),
    exterminated_at: parseTime(row.exterminated_at),
  };
}

const PAUSED_STATUS = 540; // Supabase's answer while a free project is paused

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

// Server functions raise with HINT = a short code and MESSAGE = text for people.
function toError(error, status) {
  if (status === PAUSED_STATUS || error?.status === PAUSED_STATUS) return new BackendError('paused', MESSAGES.paused);
  if (error?.hint) return new BackendError(error.hint, error.message);
  if (isOffline()) return new BackendError('offline', MESSAGES.offline);
  return new BackendError('network', MESSAGES.unreachable);
}

async function call(promise) {
  let result;
  try {
    result = await promise;
  } catch (e) {
    throw toError(e);
  }
  if (result.error || result.status === PAUSED_STATUS) throw toError(result.error, result.status);
  return result.data;
}

// Offset (ms) to add to Date.now() to get the database clock: the fastest of a
// few round trips, assuming the answer was produced halfway through it.
async function measureClockOffset(client, samples = 3) {
  let best = null;
  for (let i = 0; i < samples; i++) {
    const sent = Date.now();
    const { data, error } = await client.rpc('server_now');
    const received = Date.now();
    if (error) continue;
    const server = parseTime(data);
    if (server === null) continue;
    const rtt = received - sent;
    if (!best || rtt < best.rtt) best = { rtt, offset: server + rtt / 2 - received };
  }
  return best ? best.offset : 0;
}

export async function createSupabaseBackend({ url, key }) {
  const client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  // Reuse this browser's anonymous user if there is one; otherwise create it.
  const { data: sessionData } = await client.auth.getSession();
  let user = sessionData.session?.user ?? null;
  if (!user) {
    const { data, error } = await client.auth.signInAnonymously();
    if (error) {
      if (error.status === PAUSED_STATUS) throw new BackendError('paused', MESSAGES.paused);
      if (isOffline()) throw new BackendError('offline', MESSAGES.offline);
      if (error.status === 429) throw new BackendError('sign_in', 'Too many new visitors from your network just now. Please try again in a while.');
      if (!error.status || error.status >= 500) throw new BackendError('network', MESSAGES.unreachable);
      throw new BackendError('sign_in', 'Could not start a session. Reload the page to try again.');
    }
    user = data.user;
  }

  const clockOffset = await measureClockOffset(client);
  const listeners = new Set();
  let channel = null;
  let subscribedOnce = false;

  function emit(event) {
    for (const cb of listeners) cb(event);
  }

  async function listRoaches() {
    const data = await call(client.from('roaches')
      .select('*')
      .eq('status', 'alive')
      .order('created_at', { ascending: false })
      .limit(FLOOR_LIMIT));
    return data.map(toRow);
  }

  function connectRealtime() {
    channel = client.channel('roaches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roaches' }, (payload) => {
        if (payload.eventType === 'DELETE') emit({ type: 'DELETE', row: { id: payload.old.id } });
        else emit({ type: payload.eventType, row: toRow(payload.new) });
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        // After a reconnect, changes made while we were away were missed: reload the floor.
        if (subscribedOnce) {
          try { emit({ type: 'RESET', rows: await listRoaches() }); } catch { /* next reconnect retries */ }
        }
        subscribedOnce = true;
      });
  }

  return {
    kind: 'supabase',
    clockOffset,

    getUserId: () => user.id,

    listRoaches,

    // Realtime on `roaches`: { type: 'INSERT' | 'UPDATE' | 'DELETE', row },
    // plus { type: 'RESET', rows } after a reconnect.
    subscribe(cb) {
      listeners.add(cb);
      if (!channel) connectRealtime();
      return () => listeners.delete(cb);
    },

    // Own changes are applied at once, without waiting for Realtime (which may be
    // slow or reconnecting); its later copy of the same row changes nothing.
    async release_roach(name, complaint) {
      const row = toRow(await call(client.rpc('release_roach', { p_name: name, p_complaint: complaint })));
      emit({ type: 'INSERT', row });
      return row;
    },

    async smash(roachId) {
      return call(client.rpc('smash', { p_roach_id: roachId }));
    },

    async self_destruct(roachId) {
      await call(client.rpc('self_destruct', { p_roach_id: roachId }));
      const { data } = await client.from('roaches').select('*').eq('id', roachId).maybeSingle();
      if (data) emit({ type: 'UPDATE', row: toRow(data) });
      return true;
    },

    async hall_of_fame(limit = 30, offset = 0) {
      const rows = await call(client.rpc('hall_of_fame', { p_limit: limit, p_offset: offset }));
      return rows.map((r) => ({ ...r, exterminated_at: parseTime(r.exterminated_at) }));
    },

    async set_finisher_name(roachId, name) {
      await call(client.rpc('set_finisher_name', { p_roach_id: roachId, p_name: name }));
      return true;
    },

    debug: null, // the test helpers only exist in the fake backend
  };
}
