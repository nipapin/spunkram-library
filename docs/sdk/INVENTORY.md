# Beta ExtendScript inventory → MotionFlow SDK

Source: `C:\Users\nipap\AppData\Roaming\Adobe\CEP\extensions\Spunkram Beta\jsx\`  
Ported copies: [`src/jsx/legacy/`](../../src/jsx/legacy/)

Status legend: **ported** (file in repo) · **wrapped** (SDK method live) · **ts** (rewritten TypeScript host export) · **native-only** · **stub**

## Files

| Beta file | Size | Namespace / globals | SDK target | Status |
|---|---|---|---|---|
| `engine.jsx` | ~25 KB | `$._AtomExt_engine`, `applyItem`, pack FS helpers | `MotionFlow.bindPack`, `setEngine`, `packs.*` | ported + wrapped |
| `pp_composer.jsx` | ~118 KB | `$._AtomExt_ppComposer`, `$._copyPasteSystem`, `addMOGRT` | `MotionFlow.PPRO.*` | ported + partial wrap/ts |
| `ae_composer.jsx` | ~98 KB | `$._AtomExt_aeComposer` | `MotionFlow.AE.*` | ported + partial wrap/ts |
| `ae_preset_manager.jsx` | ~49 KB | `$._AtomExt_aePresetManager` | `MotionFlow.AE.applyPreset`, `AE.tools.*` | ported + wrapped |
| `ae_text_presets.jsx` | ~26 KB | `$._AtomExt_aeTextPresets` | `MotionFlow.AE.textPresets.*` | ported + wrapped |
| `additional.jsx` | ~9 KB | `$._AtomExt_additionalActions.arabicEngine` | `MotionFlow.AE.tools.formatArabic` | ported |
| `external_lib_import.jsx` | ~6 KB | `$._AtomExt_externalLibAssetImporter` | `MotionFlow.importExternalAsset` | ported + wrapped |
| `undo_groups.jsx` | ~7 KB | `PremiereUndoGroups` / `$.undoGroups` | `MotionFlow.PPRO.undoGroup.*` | ported + ts wrapper |
| `stockassets.jsx` | ~11 KB | `$["com.spunkramassets.cep"].importMedia` | `MotionFlow.*.importMedia` | superseded by ts `*-import-media.ts` |

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
| `addTextAnimator` / `addPhotoAnimator` | `aeComposer.*` | wrapped |
| `applyPreset` | `aePresetManager.applyPreset` | wrapped |
| `textPresets.*` | `aeTextPresets.*` | wrapped |
| `tools.*` | buttons / time-remap / auto-size | wrapped |
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
