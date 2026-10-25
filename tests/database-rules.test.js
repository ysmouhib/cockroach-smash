// The game rules and access control in supabase/migrations, checked as the
// roles a browser actually gets (anon when signed out, authenticated when signed in).
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, newUser, as } from './helpers/database.js';

const release = (db, user, name, complaint) => as(db, user, 'select * from release_roach($1, $2)', [name, complaint]);
const smash = (db, user, id) => as(db, user, 'select smash($1) as s', [id]);
const respawn = (db, id) => db.query(`update roaches set dead_until = now() - interval '1 second' where id = $1`, [id]);

describe('access control', () => {
  let db, user, roach;
  before(async () => {
    db = await createDatabase();
    user = await newUser(db);
    roach = (await release(db, user, 'Ann', 'secret text')).rows[0];
  });

  for (const table of ['roach_secrets', 'smashes', 'profiles']) {
    test(`${table} cannot be read, signed in or out`, async () => {
      for (const who of [user, null]) assert.match((await as(db, who, `select * from ${table}`)).error ?? '', /permission denied/);
    });
  }
  test('roaches can be read by everyone, without complaints', async () => {
    const rows = (await as(db, null, 'select * from roaches')).rows;
    assert.equal(rows.length, 1);
    assert.ok(!JSON.stringify(rows).includes('secret text'));
  });
  test('no table can be written directly', async () => {
    for (const sql of [
      `insert into roaches (owner_name, seed) values ('x', 1)`,
      `update roaches set smash_count = 99`,
      `delete from roaches`,
      `insert into roach_secrets values ('${roach.id}', 'x')`,
      `insert into smashes (roach_id, smasher_id) values ('${roach.id}', '${user}')`,
    ]) assert.match((await as(db, user, sql)).error ?? '', /permission denied/, sql);
  });
  test('signed-out visitors cannot call the game functions', async () => {
    assert.match((await release(db, null, 'x', 'y')).error ?? '', /permission denied/);
    assert.match((await smash(db, null, roach.id)).error ?? '', /permission denied/);
  });
  test('internal helpers are not callable', async () => {
    assert.match((await as(db, user, `select _clean_name('x')`)).error ?? '', /permission denied/);
    assert.match((await as(db, user, `select _caller()`)).error ?? '', /permission denied/);
  });
  test('the server clock is public', async () => {
    const t = (await as(db, null, 'select server_now() as t')).rows[0].t;
    assert.ok(Math.abs(t - Date.now()) < 5000);
  });
  test('row level security is on for every table; five security definer functions', async () => {
    const rls = (await db.query(`select relname, relrowsecurity from pg_class where relname in ('roaches','roach_secrets','smashes','profiles')`)).rows;
    assert.equal(rls.length, 4);
    assert.ok(rls.every((r) => r.relrowsecurity));
    const fns = (await db.query(`select prosecdef from pg_proc where proname in ('release_roach','smash','self_destruct','hall_of_fame','set_finisher_name')`)).rows;
    assert.equal(fns.length, 5);
    assert.ok(fns.every((f) => f.prosecdef));
  });
  test('Realtime publishes roaches only', async () => {
    const pub = (await db.query(`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`)).rows.map((r) => r.tablename);
    assert.deepEqual(pub, ['roaches']);
  });
});

describe('game rules', () => {
  let db;
  before(async () => { db = await createDatabase(); });

  test('names 1-24 and complaints 1-280 characters', async () => {
    const u = await newUser(db);
    assert.equal((await release(db, u, 'x'.repeat(25), 'hi')).hint, 'invalid_name');
    assert.equal((await release(db, u, 'Ann', 'x'.repeat(281))).hint, 'invalid_complaint');
    assert.ok((await release(db, u, 'a'.repeat(24), 'x'.repeat(280))).rows);
  });
  test('at most 2 living cockroaches; self-destruct frees a slot and deletes the complaint', async () => {
    const u = await newUser(db);
    const a = (await release(db, u, 'Bo', 'one')).rows[0];
    await release(db, u, 'Bo', 'two');
    assert.equal((await release(db, u, 'Bo', 'three')).hint, 'limit_reached');
    assert.equal((await as(db, await newUser(db), 'select self_destruct($1)', [a.id])).hint, 'not_owner');
    assert.ok((await as(db, u, 'select self_destruct($1)', [a.id])).rows);
    assert.equal((await db.query('select count(*)::int as n from roach_secrets where roach_id = $1', [a.id])).rows[0].n, 0);
    assert.ok((await release(db, u, 'Bo', 'three')).rows);
  });
  test('ten different smashers finish it; respawn lock; Hall of fame; finisher name', async () => {
    const owner = await newUser(db);
    const r = (await release(db, owner, 'Cy', 'final complaint')).rows[0];
    const first = (await smash(db, owner, r.id)).rows[0].s;
    assert.deepEqual([first.complaint, first.smash_count, first.final], ['final complaint', 1, false]);
    assert.equal((await smash(db, await newUser(db), r.id)).hint, 'too_slow');
    await respawn(db, r.id);
    assert.equal((await smash(db, owner, r.id)).rows[0].s.smash_count, 1, 'same person counts once');
    let last;
    for (let i = 2; i <= 10; i++) {
      await respawn(db, r.id);
      last = await newUser(db);
      const s = (await smash(db, last, r.id)).rows[0].s;
      assert.equal(s.smash_count, i);
      assert.equal(s.final, i === 10);
    }
    assert.equal((await smash(db, owner, r.id)).hint, 'gone');
    assert.equal((await as(db, owner, 'select set_finisher_name($1, $2)', [r.id, 'Thief'])).hint, 'not_finisher');
    assert.ok((await as(db, last, 'select set_finisher_name($1, $2)', [r.id, 'Winner'])).rows);
    const hof = (await as(db, owner, 'select * from hall_of_fame(30, 0)')).rows;
    assert.equal(hof.length, 1);
    assert.deepEqual([hof[0].complaint, hof[0].finisher_name], ['final complaint', 'Winner']);
    assert.equal((await smash(db, owner, randomUUID())).hint, 'not_found');
  });
});
