# Beta ExtendScript inventory → MotionFlow SDK

Source: Spunkram Beta `jsx/` (reference only).  
Runtime host: [`src/jsx/aeft/`](../src/jsx/aeft/), [`src/jsx/ppro/`](../src/jsx/ppro/), [`src/jsx/shared/`](../src/jsx/shared/) — **no** `src/jsx/legacy/` in repo.

Status legend: **ported** (file in repo) · **wrapped** (SDK method live) · **ts** (rewritten TypeScript host export) · **native-only** · **stub**

## Files

| Beta file | Host module | SDK target | Status |
|---|---|---|---|
| `engine.jsx` | `shared/engine.ts`, `shared/fs.ts` | `bindPack`, `setEngine`, `packs.*` | **ts** |
| `pp_composer.jsx` | `ppro-copy-paste.ts`, `ppro-tools.ts`, `ppro-sdk.ts` | `MotionFlow.PPRO.*` | **ts** |
| `ae_composer.jsx` | `aeft-composer.ts` | `MotionFlow.AE.applyComp`, animators, tools | **ts** |
| `ae_preset_manager.jsx` | `aeft-presets.ts` | `MotionFlow.AE.applyPreset` | **ts** (applyPreset only; customizer drop) |
| `ae_text_presets.jsx` | `aeft-text-presets.ts` | `MotionFlow.AE.textPresets.*` | **ts** |
| `additional.jsx` | `aeft-text-arabic.ts` | `AE.tools` (fix_arabic_lang) | **ts** |
| `external_lib_import.jsx` | `*-import-external.ts` | `importExternalAsset` | **ts** |
| `undo_groups.jsx` | `ppro-undo-group.ts` | `PPRO.undoGroup.*` | **ts** |
| `stockassets.jsx` | `*-import-media.ts` | `importMedia` | **ts** |

## Public operations map

### Shared / lifecycle

| Operation | Beta entry | SDK |
|---|---|---|
| Load host scripts | `evalFile` / `evalFiles` | `MotionFlow.loadHostScripts` (Bolt + legacy) |
| Bind pack context | `transferExeSwitchTrigger` | `MotionFlow.bindPack` |
| Switch engine | `transferExeEngineSwitchTrigger` | `MotionFlow.setEngine` |
| Apply pack item | `applyItem(...)` | `MotionFlow.applyPackItem` |
| Customizer | `customizeHandler` | **drop** (Beta-only, not in Library) |
| Pack FS | `copyPackageToAppData`, `deletePackageFiles` | `MotionFlow.packs.*` |

### MotionFlow.AE

| Method | Source | Status |
|---|---|---|
| `applyComp` | `aeComposer.applyComp` | wrapped (legacy) |
| `createComp` | new thin host | **ts** |
| `createText` | new thin host | **ts** |
| `addResponsiveBackground` | new thin host (solid + fit) | **ts** |
| `addTextAnimator` / `addPhotoAnimator` | `aeft-composer.*` | **ts** |
| `applyPreset` | `aeft-presets.applyPreset` | **ts** |
| `textPresets.*` | `aeft-text-presets.*` | **ts** |
| `tools.*` (AE) | `aeft-composer.aeToolsRun` | **ts** |
| `tools.*` (PR) | `ppro-tools.pproToolsRun` | **ts** |
| `applyComp` | `aeft-composer.applyComp` | **ts** |
| `describe`, captions, markers, styles | existing `aeft.ts` | **ts** + wrapped |
| `importMedia` / `importVoiceoverAudio` | `aeft-import-media.ts` | **ts** + wrapped |
| `applyPackItem` | `aeft-apply-item.ts` | **ts** + wrapped |

### MotionFlow.PPRO

| Method | Source | Status |
|---|---|---|
| `addMogrt` | `addMOGRT` / current `importMGT` | **ts** (+ legacy path via applyItem) |
| `importSequence` / `importProject` | PROJECT ctype | **ts** / wrapped |
| `importFootage` / `importAudio` | FOOTAGE / AUDIO | **ts** |
| `undoGroup.*` | `PremiereUndoGroups` | **ts** |
| `tools.*` | `buttonActions` / resize | wrapped |
| Captions / chapters / styles | existing `ppro.ts` | **ts** + wrapped |
| `FULL_PROJECT` / `$._copyPasteSystem` | native DLL + `copy-paste-apply.ts` | **shipped** (`src/bin/win/Motionflow.dll`) |

## 3.8 Native dependencies

Shipped under `src/bin/` (copied to extension root `bin/`):

- `win/Motionflow.dll` — ExternalObject for `cmd.edit.copy/paste`
- `win/MotionflowBridge.acsrf` / `MotionflowInit.prm` — Premiere plug-ins (install into Adobe Common Plug-ins)
- `template` / `colormatte` — PTX seeds → `%USER_DATA%/Adobe/Common/Spunkram/`
- `mac/cep-plugins.zip` — Mac Motionflow.bundle + bridge

Apply path: `applyPackItemToHost` → `applyFullProjectViaCopyPaste` (Beta `customChain` port).
MOGRT / FOOTAGE / AUDIO still use `ppro-apply-item.ts` import.
