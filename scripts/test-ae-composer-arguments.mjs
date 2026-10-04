import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createAE } from 'motionflow-sdk';

const require = createRequire(import.meta.url);
const hostRoot = path.dirname(require.resolve('motionflow-host/package.json'));

function load(file, imports, globals = {}) {
  const source = readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = vm.createContext({
    exports: {}, ...globals,
    require(name) {
      assert.ok(name in imports, `Unexpected dependency ${name}`);
      return imports[name];
    },
  });
  vm.runInContext(code, context);
  return context;
}

const repoFile = name => new URL(`../src/js/lib/utils/${name}.ts`, import.meta.url);
const argsApi = load(repoFile('ae-composer-arguments'), {}).exports;
const pathApi = load(repoFile('pack-apply-paths'), {
  '../cep/node': { fs: { existsSync: () => true }, path: path.posix },
  './pack-folders': {
    resolvePackTemplatesPath: () => '/packs/Assets',
    resolvePackPreviewsPath: () => '/packs/Previews',
  },
  './pack-tree': { resolveItemAssetSegments: item => item.pathSegments },
  './ae-composer-arguments': argsApi,
}).exports;

// Same group-level resize and item timing as the installed Spunkram Wedding titles.
function title(groupArgs = {}, customArgs = {}) {
  return {
    id: 'Titles-@-Wedding-@-WEDT 01', name: 'Wedding Title 01',
    previewKey: 'WEDT 01', pathSegments: ['Titles', 'Wedding'],
    group: {
      label_color_num: 10, change_auto_size_composition: 'FIT_TO_COMP', ...groupArgs,
      preview: { 'WEDT 01': {
        name: 'Wedding Title 01', custom_args: {
          layer_timing: 'TIME_REMAP_IN_OUT_REVERSE', ...customArgs,
        },
      } },
    },
  };
}

function hostFixture(width = 1920, height = 1080) {
  class CompItem {
    constructor(name, w, h, sources = []) {
      Object.assign(this, { name, width: w, height: h, duration: 10, frameDuration: 1 / 30 });
      this.layers = { length: sources.length };
      sources.forEach((source, i) => this.layers[i + 1] = {
        source, numProperties: 0, replaceSource(next) { this.source = next; },
      });
      this.selectedLayers = [];
    }
    get numLayers() { return this.layers.length; }
    layer(i) { return this.layers[i]; }
    duplicate() {
      return new CompItem(this.name, this.width, this.height,
        Array.from({ length: this.numLayers }, (_, i) => this.layer(i + 1).source));
    }
    openInViewer() {}
  }
  const nested = new CompItem('Title artwork', 3840, 2160);
  const original = new CompItem('Wedding Title 01', 3840, 2160, [nested]);
  const comp = new CompItem('Target', width, height);
  comp.time = 3;
  let placed;
  comp.layers.add = source => placed = {
    source, startTime: 0, canSetTimeRemapEnabled: true,
    transform: { scale: { value: [100, 100], setValue(value) { this.value = Array.from(value); } } },
    moveToBeginning() { this.order = 'begin'; }, moveToEnd() { this.order = 'end'; },
  };
  const globals = {
    CompItem, File: class { exists = true; },
    app: { beginUndoGroup() {}, endUndoGroup() {} },
    alert(error) { throw error; },
  };
  const native = load(path.join(hostRoot, 'src/aeft/aeft-composer.ts'), {
    './aeft-text-arabic': {}, './aeft-utils': { getActiveComp: () => comp },
  }, globals);
  // Cache lookup and naming are independent of resize; run the real composer,
  // duplication, source replacement, scale and timing functions against AE objects.
  native.findInItems = (_name, type) => type === 'Folder' ? {} : original;
  native.solveDupCompName = name => name + '[2]';
  let json;
  const host = load(path.join(hostRoot, 'src/aeft/aeft-apply-item.ts'), {
    './aeft-composer': native.exports,
    './aeft-utils': { getActiveComp: () => comp },
    '../utils/utils': { readJsonUtf8: () => json, writeJsonUtf8() {} },
  }, globals).exports;
  const received = [];
  const calls = [];
  const AE = createAE({
    getHost: () => 'AE',
    async callHost(fn, ...args) {
      calls.push(fn);
      if (fn === 'setComposerRootFolder') return native.exports.setComposerRootFolder(...args);
      if (fn === 'addTextAnimatorComp' || fn === 'addPhotoAnimatorComp') return '';
      assert.equal(fn, 'applyPackItemFromFile');
      const started = host.applyPackItemFromFile(...args);
      assert.equal(started.status, 'started');
      return host.runQueuedApplyPack();
    },
    async withJsonFile(payload, run) {
      json = JSON.parse(JSON.stringify(payload));
      received.push(json);
      return run('/temp/ae-apply.json');
    },
  });
  const Motionflow = {
    AE, bindPack: async () => {}, setEngine: async () => {},
    applyPackItem: payload => AE.applyPackItem(payload),
  };
  const panel = load(repoFile('apply-item'), {
    './bolt': { cepHostAppId: () => 'AEFT' }, '@/sdk': { Motionflow },
    '../cep/node': { fs: { existsSync: () => true }, path: path.posix },
    '@/utils/ae-import-path': { esPath: file => file }, './pack-apply-paths': pathApi,
    './copy-paste-apply': {}, './pack-types': { INSTANCE_GROUP_JOIN_CHAR: '-@-' },
    '@/api/support': { reportSupportError: async (_where, error) => { throw error; } },
    '@brands': { BRAND: { authorName: 'Spunkram', assetsBin: 'Spunkram Assets' } },
    './pack-host': { currentPackHost: () => 'AE', normalizePackHost: () => 'AE' },
    './ae-composer-arguments': argsApi,
  }).exports;
  const settings = { main: { name: 'Spunkram Library' }, inside_option_sets: {
    auto_size_composition: 'ONLY_MAIN', auto_fps_composition: 'NONE',
    duplicate_origin_setting: 'ALL_COMPS', use_start_timeline_pointer: 'FOLLOW_CURSOR',
    layer_index_position: 'MOVE_BEGIN',
  } };
  return { panel, AE, calls, received, settings, original, nested, placed: () => placed };
}

test('Wedding group survives panel → installed Motionflow SDK → queued host composer', async () => {
  const f = hostFixture();
  assert.equal((await f.panel.applyPackItemToHost(title(), '/packs/library.spunkram', f.settings)).ok, true);
  const layer = f.placed();
  assert.deepEqual([layer.source.width, layer.source.height], [3840, 2160]);
  assert.deepEqual(layer.transform.scale.value, [50, 50]);
  assert.equal(layer.source.layer(1).source.width, 3840);
  assert.equal(layer.label, 10);
  assert.equal(layer.startTime, 3);
  assert.equal(f.received[0].composer.argsObject.change_auto_size_composition, 'FIT_TO_COMP');
  assert.equal(f.received[0].composer.argsObject.custom_args.layer_timing, 'TIME_REMAP_IN_OUT_REVERSE');
  assert.equal(f.original.width, 3840);
});

test('lost group override reproduces the cropped source canvas seen in the report', async () => {
  const f = hostFixture();
  const item = title();
  await f.panel.applyPackItemToHost(item, '/packs/library.spunkram', f.settings);
  const payload = f.received[0];
  delete payload.composer.argsObject.change_auto_size_composition;
  assert.equal((await f.AE.applyPackItem(payload)).data.applied, true);
  const layer = f.placed();
  assert.deepEqual([layer.source.width, layer.source.height], [1920, 1080]);
  assert.deepEqual(layer.transform.scale.value, [100, 100]);
  assert.equal(layer.source.layer(1).source.width, 3840);
});

test('NONE, ONLY_MAIN and ALL_COMPS overrides preserve their different canvas behavior', async () => {
  for (const [mode, main, child] of [['NONE', 3840, 3840], ['ONLY_MAIN', 1920, 3840], ['ALL_COMPS', 1920, 1920]]) {
    const f = hostFixture();
    assert.equal((await f.panel.applyPackItemToHost(title({ change_auto_size_composition: mode }), '/packs/library.spunkram', f.settings)).ok, true);
    assert.equal(f.placed().source.width, main, mode);
    assert.equal(f.placed().source.layer(1).source.width, child, mode);
    assert.equal(f.nested.width, 3840, 'original child is untouched');
  }
});

test('FIT_TO_COMP retains AtomX proportional fill for portrait and square targets', async () => {
  for (const [w, h] of [[1080, 1920], [1080, 1080]]) {
    const f = hostFixture(w, h);
    await f.panel.applyPackItemToHost(title(), '/packs/library.spunkram', f.settings);
    const scale = 100 * Math.max(w / 3840, h / 2160);
    assert.deepEqual(f.placed().transform.scale.value, [scale, scale]);
    assert.equal(f.placed().source.width, 3840);
  }
});

test('group options win, false and media type strings survive, and layer args stay nested', () => {
  const item = title({
    change_auto_size_composition: 'NONE', change_auto_size_footage: 'NONE',
    change_duplicate_origin_setting: 'ONLY_MAIN', change_use_start_timeline_pointer: 'IN_MARKER_POINT',
    change_layer_index_position: 'MOVE_END', is_footage: 'PNG', individual_comp: false,
  }, { change_auto_size_composition: 'ALL_COMPS', individual_comp: true, layer_sets: 'MO_BLUR' });
  const args = argsApi.buildAEComposerArguments(item);
  assert.equal(args.change_auto_size_composition, 'NONE');
  assert.equal(args.change_auto_size_footage, 'NONE');
  assert.equal(args.change_duplicate_origin_setting, 'ONLY_MAIN');
  assert.equal(args.change_use_start_timeline_pointer, 'IN_MARKER_POINT');
  assert.equal(args.change_layer_index_position, 'MOVE_END');
  assert.equal(args.is_footage, 'PNG');
  assert.equal(args.individual_comp, false);
  assert.equal(args.custom_args, item.group.preview[item.previewKey].custom_args);
  assert.equal(args.layer_timing, undefined);
});

test('legacy item overrides remain supported, and missing resize uses pack defaults', async () => {
  const f = hostFixture();
  const item = title({ change_auto_size_composition: undefined }, { change_auto_size_composition: 'FIT_TO_COMP' });
  assert.equal(argsApi.buildAEComposerArguments(item).change_auto_size_composition, 'FIT_TO_COMP');
  delete item.group.preview[item.previewKey].custom_args.change_auto_size_composition;
  assert.equal((await f.panel.applyPackItemToHost(item, '/packs/library.spunkram', f.settings)).ok, true);
  assert.equal(f.placed().source.width, 1920);
});

test('group individual_comp and aep_file_name select the same source as AtomX', () => {
  const item = title({ aep_file_name: 'Shared Titles', individual_comp: true });
  assert.equal(pathApi.resolveItemSourceFile(item, '/packs/library.spunkram', 'AEFT', null).file,
    '/packs/Assets/Titles/Shared Titles/Wedding Title 01.aep');
  item.group.individual_comp = false;
  assert.equal(pathApi.resolveItemSourceFile(item, '/packs/library.spunkram', 'AEFT', null).file,
    '/packs/Assets/Titles/Shared Titles.aep');
});

test('group placement overrides reach the composer instead of using pack placement defaults', async () => {
  const f = hostFixture();
  await f.panel.applyPackItemToHost(title({
    change_use_start_timeline_pointer: 'START_POINT', change_layer_index_position: 'MOVE_END',
  }), '/packs/library.spunkram', f.settings);
  assert.equal(f.placed().startTime, 0);
  assert.equal(f.placed().order, 'end');
});

test('group change_engine routes through the appropriate installed SDK animator API', async () => {
  for (const [engine, fn] of [['_TEXT_ANIMATOR', 'addTextAnimatorComp'], ['_NEURO_PHOTO_ANIMATOR', 'addPhotoAnimatorComp']]) {
    const f = hostFixture();
    assert.equal((await f.panel.applyPackItemToHost(title({ change_engine: engine }), '/packs/library.spunkram', f.settings)).ok, true);
    assert.ok(f.calls.includes(fn));
    assert.equal(f.calls.includes('applyPackItemFromFile'), false);
  }
});
