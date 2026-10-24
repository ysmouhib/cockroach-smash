// In-memory stand-in for Supabase. Same interface and same rules as the real
// backend (Phase 5): the five server functions, a public `roaches` table, and
// change events like Supabase Realtime. Complaints live in a separate map and
// are only handed out by smash(), hall_of_fame() and nothing else.

import { loadPref, savePref } from './prefs.js';

export const RESPAWN_MS = 30_000;
export const SMASHERS_TO_KILL = 10;
export const MAX_LIVING = 2;
export const NAME_MAX = 24;
export const COMPLAINT_MAX = 280;

export class BackendError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const FAKE_NAMES = [
  'Marta', 'Jonas', 'Aiko', 'Luca', 'Priya', 'Sven', 'Noor', 'Mateo', 'Chloé', 'Tomasz',
  'Amara', 'Felix', 'Yuki', 'Ines', 'Kofi', 'Lena', 'Ravi', 'Zoé', 'Omar', 'Hanna',
];

const FAKE_COMPLAINTS = [
  'My flatmate leaves exactly one spoonful of milk in the carton and puts it back in the fridge.',
  'The bus driver saw me running and closed the door anyway. We made eye contact.',
  'Why does every website need my cookies, my email and my blood type before I can read a recipe?',
  'Someone in my office microwaves fish every single day at 11:30.',
  'My neighbour practises the trumpet at 7 am on Sundays. Only the first four notes of one song.',
  'Printer says "out of paper". It has paper. It has always had paper.',
  'I said "you too" when the waiter said "enjoy your meal".',
  'Autocorrect changed "meeting" to "meowing" in an email to my boss.',
  'The self-checkout thinks my own bag is an unexpected item in the bagging area.',
  'My phone charger only works if the cable is bent at exactly 37 degrees.',
  'People who stop at the top of escalators to check their phone.',
  'Socks. Where do the other ones go?',
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const charCount = (s) => Array.from(s).length; // like Postgres char_length: code points, not UTF-16 units

function checkText(value, max, code, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  const n = charCount(text);
  if (n < 1) throw new BackendError(code, `${label} can't be empty.`);
  if (n > max) throw new BackendError(code, `${label} is too long (${n}/${max} characters).`);
  return text;
}

export function createFakeBackend({ latency = [60, 180], seedRoaches = 8 } = {}) {
  const profiles = new Map(); // user id -> name
  const roaches = new Map();  // id -> public row
  const secrets = new Map();  // roach id -> complaint
  const smashes = new Set();  // `${roach_id}|${smasher_id}`, one per person per cockroach
  const listeners = new Set();

  let userId = loadPref('fake-user-id', null);
  if (!userId) { userId = crypto.randomUUID(); savePref('fake-user-id', userId); }

  const delay = () => new Promise((r) => setTimeout(r, latency[0] + Math.random() * (latency[1] - latency[0])));
  const publicRow = (row) => ({ ...row });

  function emit(type, row) {
    const event = { type, row: publicRow(row) };
    for (const cb of listeners) cb(event);
  }

  // Runs `fn` as the "server": after network latency, as one atomic step
  // (the real functions lock the row with select … for update).
  async function rpc(fn) {
    await delay();
    const caller = userId;
    const result = fn(caller, Date.now());
    await delay();
    return result;
  }

  function insertRoach(ownerId, ownerName, complaint, createdAt) {
    const row = {
      id: crypto.randomUUID(),
      owner_id: ownerId,
      owner_name: ownerName,
      seed: Math.floor(Math.random() * 2 ** 31),
      size: Math.round((0.85 + Math.random() * 0.3) * 100) / 100,
      tint: Math.round((Math.random() * 2 - 1) * 100) / 100,
      created_at: createdAt,
      dead_until: null,
      status: 'alive',
      smash_count: 0,
      exterminated_at: null,
      finisher_id: null,
      finisher_name: null,
    };
    roaches.set(row.id, row);
    secrets.set(row.id, complaint);
    emit('INSERT', row);
    return row;
  }

  function insertFakeRoach(createdAt) {
    const owner = crypto.randomUUID();
    const name = pick(FAKE_NAMES);
    profiles.set(owner, name);
    return insertRoach(owner, name, pick(FAKE_COMPLAINTS), createdAt);
  }

  const now = Date.now();
  for (let i = 0; i < seedRoaches; i++) insertFakeRoach(now - (seedRoaches - i) * 3_600_000);

  function getRoach(id) {
    const row = roaches.get(id);
    if (!row) throw new BackendError('not_found', 'That cockroach no longer exists.');
    return row;
  }

  return {
    kind: 'fake',

    getUserId: () => userId,

    // select * from roaches where status = 'alive'
    async listRoaches() {
      await delay();
      return [...roaches.values()].filter((r) => r.status === 'alive').map(publicRow);
    },

    // Supabase Realtime on `roaches`: { type: 'INSERT' | 'UPDATE' | 'DELETE', row }.
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    release_roach(name, complaint) {
      return rpc((caller, t) => {
        const cleanName = checkText(name, NAME_MAX, 'invalid_name', 'Your name');
        const text = checkText(complaint, COMPLAINT_MAX, 'invalid_complaint', 'Your complaint');
        const living = [...roaches.values()].filter((r) => r.owner_id === caller && r.status === 'alive').length;
        if (living >= MAX_LIVING) {
          throw new BackendError('limit_reached', `You already have ${MAX_LIVING} cockroaches out. Self-destruct one to release another.`);
        }
        profiles.set(caller, cleanName);
        return publicRow(insertRoach(caller, cleanName, text, t));
      });
    },

    smash(roachId) {
      return rpc((caller, t) => {
        const row = getRoach(roachId);
        if (row.status !== 'alive') throw new BackendError('gone', 'This cockroach is already gone.');
        if (row.dead_until !== null && row.dead_until > t) throw new BackendError('too_slow', 'Too slow, someone got it first');

        smashes.add(`${row.id}|${caller}`);
        let count = 0;
        for (const key of smashes) if (key.startsWith(`${row.id}|`)) count++;
        row.smash_count = count;

        const final = count >= SMASHERS_TO_KILL;
        if (final) {
          row.status = 'exterminated';
          row.exterminated_at = t;
          row.finisher_id = caller;
          row.finisher_name = profiles.get(caller) ?? null;
          row.dead_until = null;
        } else {
          row.dead_until = t + RESPAWN_MS;
        }
        emit('UPDATE', row);
        return { complaint: secrets.get(row.id), owner_name: row.owner_name, smash_count: count, final, finisher_name: row.finisher_name };
      });
    },

    self_destruct(roachId) {
      return rpc((caller) => {
        const row = getRoach(roachId);
        if (row.owner_id !== caller) throw new BackendError('not_owner', 'Only its owner can self-destruct a cockroach.');
        if (row.status !== 'alive') throw new BackendError('gone', 'This cockroach is already gone.');
        row.status = 'self_destructed';
        row.dead_until = null;
        emit('UPDATE', row);
        return true;
      });
    },

    hall_of_fame(limit = 30, offset = 0) {
      return rpc(() => [...roaches.values()]
        .filter((r) => r.status === 'exterminated')
        .sort((a, b) => b.exterminated_at - a.exterminated_at)
        .slice(offset, offset + limit)
        .map((r) => ({
          roach_id: r.id,
          owner_name: r.owner_name,
          complaint: secrets.get(r.id),
          finisher_name: r.finisher_name,
          exterminated_at: r.exterminated_at,
        })));
    },

    set_finisher_name(roachId, name) {
      return rpc((caller) => {
        const row = getRoach(roachId);
        if (row.finisher_id !== caller) throw new BackendError('not_finisher', 'Only the person who finished it can sign it.');
        row.finisher_name = checkText(name, NAME_MAX, 'invalid_name', 'Your name');
        emit('UPDATE', row);
        return true;
      });
    },

    // Test helpers for ?debug=1. Not part of the real backend.
    debug: {
      switchUser() {
        userId = crypto.randomUUID();
        return userId;
      },
      respawnAll() {
        const t = Date.now();
        for (const row of roaches.values()) {
          if (row.status === 'alive' && row.dead_until !== null && row.dead_until > t) {
            row.dead_until = t;
            emit('UPDATE', row);
          }
        }
      },
      spawn(n) {
        for (let i = 0; i < n; i++) insertFakeRoach(Date.now());
      },
      removeNewest(n) {
        const alive = [...roaches.values()].filter((r) => r.status === 'alive').sort((a, b) => b.created_at - a.created_at);
        for (const row of alive.slice(0, n)) {
          roaches.delete(row.id);
          secrets.delete(row.id);
          emit('DELETE', row);
        }
      },
    },
  };
}
