import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function load(relativePath, dependencies) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, Buffer, console, setTimeout, clearTimeout,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

const common = '/Library/Application Support/Adobe/Common';
const extensionRoot = "/Users/Ivan O'Neil/Library/Application Support/Adobe/CEP/extensions/Шпункрам $test";
const bundles = ['Motionflow', 'MotionflowBridge', 'MotionflowInit'];

function fixture({ installed = false, incomplete = false, denyAdmin = false } = {}) {
  const files = new Map();
  const calls = [];
  const permissions = [];
  const archive = path.posix.join(extensionRoot, 'bin/mac/cep-plugins.zip');
  files.set(archive, Buffer.from('trusted packaged archive'));
  const putBundle = (root, name) => {
    files.set(`${root}/Contents/MacOS/${name}`, Buffer.from('native'));
    files.set(`${root}/Contents/Info.plist`, Buffer.from('plist'));
  };
  const destination = name => `${common}/${name === 'MotionflowBridge' ? 'Plug-ins/ControlSurface' : 'Plugins/7.0/MediaCore'}/${name}.bundle`;
  if (installed) for (const name of bundles.slice(1)) putBundle(destination(name), name);
  const exists = file => files.has(file) || [...files.keys()].some(key => key.startsWith(`${file}/`));
  const deps = {
    crypto, path: path.posix, os: { homedir: () => "/Users/Ivan O'Neil", platform: () => 'darwin' },
    fs: {
      existsSync: exists,
      statSync(file) {
        if (!files.has(file)) throw new Error('ENOENT');
        return { size: files.get(file).length };
      },
      readFileSync(file) { assert.ok(files.has(file)); return files.get(file); },
      mkdirSync() {},
      mkdtempSync(prefix) { return `${prefix}unique`; },
      chmodSync(file, mode) { assert.ok(files.has(file)); permissions.push([file, mode]); },
      renameSync(from, to) {
        for (const [file, contents] of [...files]) {
          if (file.startsWith(`${from}/`)) {
            files.delete(file);
            files.set(`${to}${file.slice(from.length)}`, contents);
          }
        }
      },
      rmdirSync(dir) { for (const file of [...files.keys()]) if (file.startsWith(`${dir}/`)) files.delete(file); },
    },
    child_process: {
      execFile(command, args, options, callback) {
        calls.push({ command, args, options });
        if (command === '/usr/bin/ditto') {
          assert.deepEqual(Array.from(args).slice(0, 2), ['-x', '-k']);
          for (const name of incomplete ? bundles.slice(0, 2) : bundles) putBundle(`${args[3]}/${name}.bundle`, name);
        }
        if (command === '/usr/bin/osascript' && !denyAdmin) {
          for (const name of bundles.slice(1)) putBundle(destination(name), name);
        }
        setTimeout(() => callback(denyAdmin && command === '/usr/bin/osascript' ? new Error('User canceled. (-128)') : null, '', ''), 0);
      },
    },
  };
  const api = load('../src/js/lib/utils/premiere-native.ts', {
    '@/lib/cep/node': deps,
    '@brands': { BRAND: { prefsCompany: 'Spunkram', prefsProduct: 'Spunkram Library' } },
  });
  return { api, deps, calls, permissions, files, putBundle };
}

test('Mac bridge matches the shipped Init lookup, while preserving existing Adobe plugin locations', () => {
  const { api } = fixture();
  const current = api.macBridgeInstallPlan('/native', () => false);
  assert.equal(current[0].destination, `${common}/Plug-ins/ControlSurface/MotionflowBridge.bundle`);
  assert.equal(current[1].destination, `${common}/Plugins/7.0/MediaCore/MotionflowInit.bundle`);
  const legacy = api.macBridgeInstallPlan('/native', file => file.includes('/Plug-ins/'));
  assert.ok(legacy.every(item => item.destination.includes('/Plug-ins/')));
  const modern = api.macBridgeInstallPlan('/native', file => file.includes('/Plugins/'));
  assert.ok(modern.every(item => item.destination.includes('/Plugins/')));
});

test('first Mac use unpacks all three bundles once, outside the CEP installation', async () => {
  const { api, calls, permissions, files } = fixture();
  const [first, duplicate] = await Promise.all([
    api.ensureMacMotionflowLibrary(extensionRoot), api.ensureMacMotionflowLibrary(extensionRoot),
  ]);
  assert.equal(first, duplicate);
  assert.match(first, /Spunkram\/Spunkram Library\/native\/mac\/[a-f0-9]{24}$/);
  assert.equal(calls.filter(call => call.command === '/usr/bin/ditto').length, 1);
  assert.equal(permissions.length, 3);
  assert.ok(permissions.every(([, mode]) => mode === 0o755));
  for (const name of bundles) assert.ok(files.has(`${first}/${name}.bundle/Contents/MacOS/${name}`));
  assert.equal(await api.ensureMacMotionflowLibrary(extensionRoot), first);
  assert.equal(calls.filter(call => call.command === '/usr/bin/ditto').length, 1);
  assert.equal(calls.filter(call => call.command === '/usr/bin/osascript').length, 0);
});

test('incomplete archives fail before installation and can be retried', async () => {
  const { api, calls, files } = fixture({ incomplete: true });
  await assert.rejects(api.ensureMacMotionflowLibrary(extensionRoot), /incomplete/);
  await assert.rejects(api.ensureMacMotionflowLibrary(extensionRoot), /incomplete/);
  assert.equal(calls.filter(call => call.command === '/usr/bin/ditto').length, 2);
  assert.equal(calls.filter(call => call.command === '/usr/bin/osascript').length, 0);
  assert.ok(![...files.keys()].some(key => key.includes('/.bridge-')));
});

test('Mac installation prompts once, quotes Unicode/apostrophe paths and requires restart', async () => {
  const { api, calls } = fixture();
  assert.equal(api.macBridgeStatus().installed, false);
  await api.installMacPremiereBridge(extensionRoot);
  assert.equal(api.macBridgeStatus().installed, true);
  assert.equal(api.macBridgeStatus().restartRequired, true);
  const prompt = calls.find(call => call.command === '/usr/bin/osascript');
  assert.equal(prompt.args[0], '-e');
  assert.match(prompt.args[1], /with administrator privileges$/);
  assert.ok(prompt.args[1].includes("Ivan O'\\\\''Neil"));
  assert.ok(prompt.args[1].includes('/Plug-ins/ControlSurface/MotionflowBridge.bundle'));
  await api.installMacPremiereBridge(extensionRoot);
  assert.equal(calls.filter(call => call.command === '/usr/bin/osascript').length, 1);
});

test('cancelling admin permission never reports an installed or ready bridge', async () => {
  const { api } = fixture({ denyAdmin: true });
  await assert.rejects(api.installMacPremiereBridge(extensionRoot), /User canceled/);
  assert.equal(api.macBridgeStatus().installed, false);
  assert.equal(api.macBridgeStatus().restartRequired, false);
});

test('existing Mac plugins do not prompt for admin or request a restart', async () => {
  const { api, calls } = fixture({ installed: true });
  await api.installMacPremiereBridge(extensionRoot);
  assert.equal(api.macBridgeStatus().installed, true);
  assert.equal(api.macBridgeStatus().restartRequired, false);
  assert.ok(!calls.some(call => call.command === '/usr/bin/osascript'));
});

function loadApply(native, deps, hostCalls) {
  return load('../src/js/lib/utils/copy-paste-apply.ts', {
    '@/lib/utils/bolt': {
      csi: { getSystemPath: key => key === 'extension' ? extensionRoot : '/Users/Ivan/Library' },
      async evalTS(name, ...args) {
        hostCalls.push({ name, args });
        if (name === 'copyPasteInitializeLibrary') return { ready: false, error: 'test stop before project mutation' };
        return {};
      },
    },
    '@/lib/cep/node': { ...deps, zlib: {} },
    '@/sdk': { MotionFlow: { ready: async () => {} } },
    './premiere-native': native,
    './pack-folders': {},
  });
}

test('Mac copy/paste supplies the actual extracted bundle parent to the host', async () => {
  const { api, deps, files } = fixture({ installed: true });
  files.set('/project.prproj', Buffer.from('project'));
  const hostCalls = [];
  const { applyFullProjectViaCopyPaste } = loadApply(api, deps, hostCalls);
  await applyFullProjectViaCopyPaste({ projectPath: '/project.prproj', presetName: 'Transition' });
  const base = hostCalls.find(call => call.name === 'copyPasteInitializeLibrary').args[0];
  assert.ok(files.has(`${base}/Motionflow.bundle/Contents/MacOS/Motionflow`));
  assert.equal(hostCalls.find(call => call.name === 'copyPasteInitializeLibrary').args[1], 'mac');
});

test('missing Mac Bridge stops before importing or changing a Premiere project', async () => {
  const { api, deps } = fixture();
  const hostCalls = [];
  const { applyFullProjectViaCopyPaste } = loadApply(api, deps, hostCalls);
  const result = await applyFullProjectViaCopyPaste({ projectPath: '/project.prproj' });
  assert.equal(result.ok, false);
  assert.match(result.message, /Control Surface > Add/);
  assert.equal(hostCalls.length, 0);
});
