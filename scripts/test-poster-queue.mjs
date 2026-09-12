import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/js/lib/utils/poster-queue.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } });
const { PosterQueue } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

test('142 posters stay within four active loads, with FIFO and duplicate sharing', async () => {
  const started = [];
  const finish = new Map();
  let active = 0, peak = 0, released = 0;
  const queue = new PosterQueue(key => new Promise(resolve => {
    started.push(key);
    peak = Math.max(peak, ++active);
    finish.set(key, () => { active--; resolve({ url: key, release: () => released++ }); });
  }));
  const seen = [];
  const cleanups = Array.from({ length: 142 }, (_, i) => queue.subscribe(String(i), url => seen.push(url)));
  const duplicate = queue.subscribe('0', url => seen.push(`duplicate:${url}`));
  await tick();
  assert.deepEqual(started, ['0', '1', '2', '3']);
  // Switching category cancels all queued work without starting those downloads.
  cleanups.slice(4).forEach(cleanup => cleanup());
  finish.get('0')();
  await tick();
  assert.deepEqual(seen, ['0', 'duplicate:0']);
  cleanups[0]();
  assert.equal(released, 0);
  duplicate();
  assert.equal(released, 1);
  cleanups.slice(1, 4).forEach(cleanup => cleanup());
  for (const key of ['1', '2', '3']) finish.get(key)();
  await tick();
  assert.equal(peak, 4);
  assert.equal(started.length, 4);
  assert.equal(released, 4);
});

test('failures free slots and an abandoned active request can be re-subscribed', async () => {
  const starts = [];
  let finish;
  const queue = new PosterQueue(async key => {
    starts.push(key);
    if (key === 'bad') throw new Error('offline');
    return new Promise(resolve => { finish = () => resolve({ url: key, release() {} }); });
  }, 1);
  let failed = false;
  queue.subscribe('bad', url => { failed = url === null; });
  const cancel = queue.subscribe('good', () => assert.fail('cancelled consumer notified'));
  await tick();
  await tick();
  cancel();
  let result;
  const cleanup = queue.subscribe('good', url => { result = url; });
  finish();
  await tick();
  assert.equal(failed, true);
  assert.equal(result, 'good');
  assert.deepEqual(starts, ['bad', 'good']);
  cleanup();
});
