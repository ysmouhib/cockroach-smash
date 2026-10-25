// The in-memory fake backend must enforce the same rules as the real one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBackend } from '../src/data/fakeBackend.js';

const fresh = () => createFakeBackend({ latency: [0, 2], seedRoaches: 0 });
const codeOf = async (p) => { try { await p; return null; } catch (e) { return e.code; } };

test('length limits and trimming', async () => {
  const b = fresh();
  assert.equal(await codeOf(b.release_roach('', 'x')), 'invalid_name');
  assert.equal(await codeOf(b.release_roach('a'.repeat(25), 'x')), 'invalid_name');
  assert.equal(await codeOf(b.release_roach('Ann', 'x'.repeat(281))), 'invalid_complaint');
  assert.equal(await codeOf(b.release_roach('Ann', '   ')), 'invalid_complaint');
  const r = await b.release_roach('  ' + 'a'.repeat(24) + ' ', 'x'.repeat(280));
  assert.equal(r.owner_name, 'a'.repeat(24));
  assert.ok(!('complaint' in r));
});

test('two living cockroaches; self-destruct frees a slot, owner only', async () => {
  const b = fresh();
  const a = await b.release_roach('Bo', 'one');
  await b.release_roach('Bo', 'two');
  assert.equal(await codeOf(b.release_roach('Bo', 'three')), 'limit_reached');
  b.debug.switchUser();
  assert.equal(await codeOf(b.self_destruct(a.id)), 'not_owner');
  const c = fresh();
  const own = await c.release_roach('Cy', 'mine');
  assert.equal(await codeOf(c.self_destruct(own.id)), null);
  assert.equal(await codeOf(c.self_destruct(own.id)), 'gone');
});

test('ten distinct smashers, respawn lock, Hall of fame', async () => {
  const b = fresh();
  const t = await b.release_roach('Cy', 'secret');
  assert.equal((await b.smash(t.id)).smash_count, 1);
  assert.equal(await codeOf(b.smash(t.id)), 'too_slow');
  let res;
  for (let i = 2; i <= 10; i++) { b.debug.respawnAll(); b.debug.switchUser(); res = await b.smash(t.id); }
  assert.equal(res.final, true);
  assert.equal(await codeOf(b.smash(t.id)), 'gone');
  await b.set_finisher_name(t.id, 'Winner');
  const hof = await b.hall_of_fame(30, 0);
  assert.deepEqual([hof[0].complaint, hof[0].finisher_name], ['secret', 'Winner']);
});

test('two smashes at the same instant: one wins', async () => {
  const b = createFakeBackend({ latency: [5, 30], seedRoaches: 0 });
  const r = await b.release_roach('Di', 'race');
  const p1 = b.smash(r.id); b.debug.switchUser(); const p2 = b.smash(r.id);
  const out = await Promise.allSettled([p1, p2]);
  assert.equal(out.filter((o) => o.status === 'fulfilled').length, 1);
  assert.equal(out.filter((o) => o.reason?.code === 'too_slow').length, 1);
});
