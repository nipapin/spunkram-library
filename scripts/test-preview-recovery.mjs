import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function loadModule(relativePath, dependencies, globals = {}) {
  const source = fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, Buffer, URL, Blob, AbortController, setTimeout, clearTimeout,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    ...globals,
  });
  return exports;
}

async function bounded(promise, ms = 1000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('request never settled')), ms);
    })]);
  } finally { clearTimeout(timer); }
}

async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

const nodeDeps = { http, https, fs, os, path };
function cepRequest() {
  return loadModule('../src/js/lib/api/cep-http.ts', { '@/lib/cep/node': nodeDeps }, {
    window: { cep: {} },
    XMLHttpRequest: class {
      open() {}
      send() { this.onerror(); }
    },
  }).cepHttpRequest;
}

test('CEP API deadline bounds a response that keeps the socket active', async t => {
  const origin = await serve(t, (_, res) => {
    res.writeHead(200);
    const timer = setInterval(() => res.write(' '), 10);
    res.on('close', () => clearInterval(timer));
  });
  const request = cepRequest();
  const result = await bounded(request(origin, { timeoutMs: 80 }));
  assert.equal(result.error, 'TIMEOUT');
  assert.equal(result.status, 0);
});

test('CEP interrupted body settles and the next request can succeed', async t => {
  const origin = await serve(t, (req, res) => {
    if (req.url === '/broken') {
      res.writeHead(200, { 'Content-Length': '10000' });
      res.write('partial');
      setTimeout(() => res.destroy(), 15);
    } else res.end('{"ok":true}');
  });
  const request = cepRequest();
  const broken = await bounded(request(`${origin}/broken`, { timeoutMs: 200 }));
  assert.equal(broken.ok, false);
  assert.equal(broken.error, 'NO_CONNECTION');
  const good = await bounded(request(origin, { timeoutMs: 200 }));
  assert.equal(good.ok, true);
  assert.equal(good.text, '{"ok":true}');
});

test('an HTTP 401 keeps its status and body for session handling', async t => {
  const origin = await serve(t, (_, res) => {
    res.writeHead(401);
    res.end('{"error":"UNAUTHORIZED"}');
  });
  const result = await bounded(cepRequest()(origin));
  assert.equal(result.status, 401);
  assert.equal(result.text, '{"error":"UNAUTHORIZED"}');
});

test('browser deadline includes reading the body and aborts stalled fetch', async () => {
  let signal;
  const { cepHttpRequest } = loadModule('../src/js/lib/api/cep-http.ts', {
    '@/lib/cep/node': {},
  }, {
    fetch: async (_, init) => {
      signal = init.signal;
      return { ok: true, text: () => new Promise(() => {}) };
    },
  });
  const result = await bounded(cepHttpRequest('https://example.invalid', { timeoutMs: 50 }));
  assert.equal(result.error, 'TIMEOUT');
  assert.equal(signal.aborted, true);
});

test('preview download deadline covers redirects and trickling bodies, leaving no partial file', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-recovery-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const origin = await serve(t, (req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/slow' });
      res.end();
      return;
    }
    if (req.url === '/slow') {
      res.writeHead(200);
      const timer = setInterval(() => res.write('media'), 10);
      res.on('close', () => clearInterval(timer));
    } else res.end('complete');
  });
  const { downloadToFile } = loadModule('../src/js/utils/download-file.ts', {
    '../lib/cep/node': nodeDeps,
  });
  const dest = path.join(dir, 'poster.png');
  await assert.rejects(bounded(downloadToFile(`${origin}/redirect`, dest, {
    timeoutMs: 200, totalTimeoutMs: 80,
  })), /Download timed out/);
  assert.deepEqual(fs.readdirSync(dir), []);
  await bounded(downloadToFile(`${origin}/good`, dest, { totalTimeoutMs: 500 }));
  assert.equal(fs.readFileSync(dest, 'utf8'), 'complete');
});

test('suspended disk reads free preview slots and discard late callbacks', async () => {
  const callbacks = [];
  let blobs = 0;
  const fakeUrl = {
    createObjectURL() { return `blob:${++blobs}`; },
    revokeObjectURL() {},
  };
  const previews = loadModule('../src/js/lib/utils/pack-preview.ts', {
    '../cep/node': {
      path, fs: { readFile(file, cb) {
        if (file === 'good.png') cb(null, Buffer.from('good'));
        else callbacks.push(cb);
      } },
    },
    './pack-apply-paths': {}, './pack-tree': {},
  }, {
    URL: fakeUrl,
    setTimeout: (callback, ms) => setTimeout(callback, ms === 15000 ? 40 : ms),
  });
  const results = await bounded(Promise.all([
    ...['stuck1', 'stuck2', 'stuck3'].map(file => previews.loadPreviewObjectUrl(file)),
    previews.loadPreviewObjectUrl('good.png'),
  ]));
  assert.deepEqual(results, [null, null, null, 'blob:1']);
  for (const cb of callbacks) cb(null, Buffer.from('late'));
  assert.equal(blobs, 1);
  assert.equal(previews.peekPreviewObjectUrlSync('stuck1'), null);
  previews.releasePreviewObjectUrl('good.png');
});
