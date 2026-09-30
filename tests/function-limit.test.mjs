import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Vercel Hobby plan: at most 12 serverless functions per deployment. Every .js file under
// api/ (except _lib) is a function, so adding one more breaks the deployment.
const collect = (dir) =>
  readdirSync(dir).flatMap((name) => {
    if (name.startsWith('_')) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? collect(full) : name.endsWith('.js') ? [full] : [];
  });

test('api/ has at most 12 serverless functions (Vercel Hobby limit)', () => {
  const functions = collect('api');
  assert.ok(functions.length <= 12, `${functions.length} functions: ${functions.join(', ')}`);
});
