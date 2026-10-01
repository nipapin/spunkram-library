import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import ts from 'typescript';

const [zip, output] = process.argv.slice(2);
if (!zip || !output) throw new Error('Usage: node scripts/smoke-odin-zip.mjs <pack.zip> <new-test-directory>');
if (fs.existsSync(output)) throw new Error('Test output must not exist');
const source = fs.readFileSync(new URL('../src/js/lib/utils/pack-zip.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(name => {
  if (name !== '../cep/node') throw new Error('Unexpected dependency');
  return { fs, path, zlib };
}, module, module.exports);
const files = module.exports.extractZipToFolder(path.resolve(zip), path.resolve(output));
const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
for (const entry of manifest) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(output, entry.path))).digest('hex');
  if (hash !== entry.hash) throw new Error('Extracted hash mismatch: ' + entry.path);
}
const definitions = manifest.filter(e => e.path.endsWith('.odin'));
if (definitions.length !== 1) throw new Error('Expected one .odin');
const pack = JSON.parse(fs.readFileSync(path.join(output, definitions[0].path), 'utf8').replace(/^\uFEFF/, ''));
if (!pack.settings || !(pack.structure ?? pack.content ?? pack.contents ?? pack.settings.contents)) throw new Error('Invalid JSON pack');
console.log(JSON.stringify({ host: pack.settings.main.software_id, extractedByCep: true, files: files.length, allHashesMatch: true }));
