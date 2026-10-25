// A local stand-in for a Supabase database: the roles and auth.uid() that
// Supabase provides, its default grants, and every migration in order.
// PGlite is real Postgres compiled to WebAssembly, so the SQL runs unchanged.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

export const SUPABASE_STAND_IN = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  create publication supabase_realtime;
`;

export function migrationFiles(upTo = Infinity) {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => Number.parseInt(f, 10) <= upTo)
    .map((f) => ({ name: f, sql: readFileSync(new URL(f, MIGRATIONS), 'utf8') }));
}

// A fresh database with migrations applied up to number `upTo`.
export async function createDatabase({ upTo = Infinity } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  for (const m of migrationFiles(upTo)) await db.exec(m.sql);
  return db;
}

export async function newUser(db) {
  const id = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [id]);
  return id;
}

// Runs one query as a browser would: signed in as `user` (role authenticated),
// or signed out (role anon) when `user` is null. Returns { rows } or { error, hint }.
export async function as(db, user, sql, params = []) {
  await db.exec(`reset role; set request.jwt.claim.sub = '${user ?? ''}'; set role ${user ? 'authenticated' : 'anon'};`);
  try {
    return { rows: (await db.query(sql, params)).rows };
  } catch (e) {
    return { error: e.message, hint: e.hint };
  } finally {
    await db.exec('reset role;');
  }
}
