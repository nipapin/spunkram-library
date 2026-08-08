# MotionFlow SDK

Public contract for host work. **UI and authors must not call `evalTS` / ExtendScript directly** — only `MotionFlow.*`.

## Architecture

```
Panel / author code
        │
        ▼
src/js/sdk/MotionFlow.ts     ← public API
        │
   evalTS / evalES / legacy loader
        │
$[extensionId]  +  src/jsx/legacy/* (Beta port)
```

- **JS SDK**: [`src/js/sdk/`](../src/js/sdk/)
- **Host TS**: [`src/jsx/aeft/`](../src/jsx/aeft/), [`src/jsx/ppro/`](../src/jsx/ppro/), [`src/jsx/shared/`](../src/jsx/shared/)
- **Legacy Beta port**: [`src/jsx/legacy/`](../src/jsx/legacy/) (loaded after Bolt `index.js`)

Inventory: [`docs/sdk/INVENTORY.md`](./sdk/INVENTORY.md) · Parity: [`docs/sdk/PARITY.md`](./sdk/PARITY.md) · Author guide: [`docs/sdk/AUTHOR_COOKBOOK.md`](./sdk/AUTHOR_COOKBOOK.md)

## Result shape

Every async SDK call returns:

```ts
type MfResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };
```

## Host

```ts
MotionFlow.host        // "AE" | "PPRO" | null
MotionFlow.version     // string, matches package.json
MotionFlow.isReady()   // host scripts loaded
await MotionFlow.loadHostScripts()
```

## Shared lifecycle

```ts
await MotionFlow.bindPack(ctx)
await MotionFlow.setEngine(engineType)
await MotionFlow.applyItem(payload)           // pack apply (decrypt stays in JS)
await MotionFlow.customize.get(...)
await MotionFlow.customize.set(...)
await MotionFlow.packs.copyToAppData(...)     // legacy
await MotionFlow.packs.deleteFiles(...)       // legacy
await MotionFlow.importExternalAsset(...)
```

## MotionFlow.AE

```ts
MotionFlow.AE.createComp({ name, width, height, duration?, frameRate? })
MotionFlow.AE.createText({ text, compId?, fontSize?, ... })
MotionFlow.AE.addResponsiveBackground({ color?, compId? })
MotionFlow.AE.applyComp(...)                  // legacy composer
MotionFlow.AE.addTextAnimator(...)
MotionFlow.AE.addPhotoAnimator(...)
MotionFlow.AE.applyPreset(...)
MotionFlow.AE.textPresets.apply / get / remove
MotionFlow.AE.customize.*
MotionFlow.AE.tools.*
MotionFlow.AE.describe(audioPresetPath?)
MotionFlow.AE.addMarkers({ markers })
MotionFlow.AE.createCaptions / resegment / update / find / load / saveSession
MotionFlow.AE.applyStyleProject / applyCaptionStyleValues
MotionFlow.AE.importMedia / importVoiceoverAudio
MotionFlow.AE.applyPackItem(payload)
```

## MotionFlow.PPRO

```ts
MotionFlow.PPRO.addMogrt({ filePath, itemName?, trackIndex? })
MotionFlow.PPRO.importSequence / importProject / importFootage / importAudio
MotionFlow.PPRO.undoGroup.start / end / abort
MotionFlow.PPRO.customize.*
MotionFlow.PPRO.tools.*
MotionFlow.PPRO.describe / markSilences / addMarkers / captions… / styles…
MotionFlow.PPRO.importMedia / importVoiceoverAudio
MotionFlow.PPRO.applyPackItem(payload)
```

## Rules

1. **New UI features only through SDK** — no new `evalTS` in `src/js/main`, components, or apps.
2. SDK does **not** own AtomX crypto decode long-term; plaintext Market packs are the hot path. Soft-legacy decode remains for already-installed encrypted packs (see Операция «Отречение»).
3. `FULL_PROJECT` uses `$._copyPasteSystem` + shipped `Motionflow.dll` (`applyFullProjectViaCopyPaste`).
4. Prefer `MotionFlow.AE` / `MotionFlow.PPRO` over host-agnostic guesses; use `MotionFlow.host` to branch UI.

## Import

```ts
import { MotionFlow } from "@/sdk";
// or
import { MotionFlow } from "../sdk/MotionFlow";
```
