// Calls arriving at the same instant, on a real PostgreSQL server with separate
// connections (PGlite has only one). Needs DATABASE_URL, e.g. the postgres
// service in the GitHub Actions workflow; skipped otherwise.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { SUPABASE_STAND_IN, migrationFiles } from './helpers/database.js';

const url = process.env.DATABASE_URL;

describe('simultaneous calls on real PostgreSQL', { skip: !url && 'set DATABASE_URL to run' }, () => {
  let pool, adminPool, dbName;
  const users = Array.from({ length: 40 }, () => randomUUID());

  before(async () => {
    // A throwaway database, so the test never touches anything else on the server.
    adminPool = new pg.Pool({ connectionString: url });
    dbName = `cockroach_race_${Date.now()}`;
    await adminPool.query(`create database ${dbName} encoding 'UTF8' template template0`);
    const u = new URL(url);
    u.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: u.toString(), max: 20 });
    const roles = (await pool.query(`select rolname from pg_roles where rolname in ('anon', 'authenticated')`)).rows.length;
    await pool.query(roles ? SUPABASE_STAND_IN.replace(/create role \w+ nologin;/g, '') : SUPABASE_STAND_IN);
    for (const m of migrationFiles()) await pool.query(m.sql);
    for (const id of users) await pool.query('insert into auth.users values ($1)', [id]);
  });

  after(async () => {
    await pool?.end();
    await adminPool?.query(`drop database if exists ${dbName}`);
    await adminPool?.end();
  });

  // One call as a signed-in browser, on its own connection and transaction.
  async function as(user, sql, params) {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user]);
      await c.query('set local role authenticated');
      const r = await c.query(sql, params);
      await c.query('commit');
      return { rows: r.rows };
    } catch (e) {
      await c.query('rollback').catch(() => {});
      return { hint: e.hint, error: e.message };
    } finally {
      c.release();
    }
  }

  test('8 simultaneous smashes: exactly one counts each round', async () => {
    const roach = (await as(users[0], `select * from release_roach('Owner', 'race')`)).rows[0];
    for (let round = 0; round < 25; round++) {
      await pool.query('update roaches set dead_until = null where id = $1', [roach.id]);
      const smashers = Array.from({ length: 8 }, (_, k) => users[1 + ((round * 3 + k) % 29)]);
      const results = await Promise.all(smashers.map((u) => as(u, 'select smash($1) as s', [roach.id])));
      const wins = results.filter((r) => r.rows);
      const refused = results.filter((r) => r.hint === 'too_slow' || r.hint === 'gone');
      assert.equal(wins.length, 1, `round ${round}`);
      assert.equal(refused.length, 7, `round ${round}`);
      const { smash_count: count, status } = (await pool.query('select smash_count, status from roaches where id = $1', [roach.id])).rows[0];
      const distinct = (await pool.query('select count(*)::int as n from smashes where roach_id = $1', [roach.id])).rows[0].n;
      assert.equal(count, distinct);
      if (status !== 'alive') break;
    }
  });

  test('two people racing for the 10th smash: one final kill', async () => {
    const r = (await as(users[1], `select * from release_roach('Owner2', 'final race')`)).rows[0];
    for (let i = 2; i <= 10; i++) {
      await pool.query('update roaches set dead_until = null where id = $1', [r.id]);
      await as(users[i], 'select smash($1) as s', [r.id]);
    }
    await pool.query('update roaches set dead_until = null where id = $1', [r.id]);
    const both = await Promise.all([as(users[20], 'select smash($1) as s', [r.id]), as(users[21], 'select smash($1) as s', [r.id])]);
    assert.equal(both.filter((x) => x.rows?.[0].s.final).length, 1);
    const row = (await pool.query('select smash_count, status from roaches where id = $1', [r.id])).rows[0];
    assert.deepEqual([row.smash_count, row.status], [10, 'exterminated']);
  });

  test('6 simultaneous releases by one person: only 2 live', async () => {
    const greedy = users[30];
    await Promise.all(Array.from({ length: 6 }, (_, i) => as(greedy, `select * from release_roach('Greedy', $1)`, [`spam ${i}`])));
    const alive = (await pool.query(`select count(*)::int as n from roaches where owner_id = $1 and status = 'alive'`, [greedy])).rows[0].n;
    assert.equal(alive, 2);
  });
});
