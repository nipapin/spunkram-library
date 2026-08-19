# FULL_PROJECT — copy/paste host API inventory

Used by [`copy-paste-apply.ts`](../../src/js/lib/utils/copy-paste-apply.ts).  
Host module: [`ppro-copy-paste.ts`](../../src/jsx/ppro/ppro-copy-paste.ts).

Native **`Motionflow.dll`** is not reimplemented — only TS orchestration moved off `pp_composer.jsx`.

## Port status — **done**

| Legacy method | DLL? | Host TS export | Status |
|--------|------|----------------|--------|
| `getAppPrefs` | no | `copyPasteGetAppPrefs` | **done** |
| `checkForDuplicatesOfAuthorFolder` | no | `copyPasteCheckForDuplicatesOfAuthorFolder` | **done** |
| `createStructure` | no | `copyPasteCreateStructure` | **done** |
| `getMetadata` | no | `copyPasteGetMetadata` | **done** |
| `isSelectedItemExists` | no | `copyPasteIsSelectedItemExists` | **done** |
| `getSelectedItem` | no | `copyPasteGetSelectedItem` | **done** |
| `isResolutionExists` | no | `copyPasteIsResolutionExists` | **done** |
| `importSelectedItem` | no | `copyPasteImportSelectedItem` | **done** |
| `initializeLibrary` | **yes** | `copyPasteInitializeLibrary` | **done** |
| `executeCommand` | **yes** | `copyPasteExecuteCommand` | **done** |
| `collectClipsPreset` | QE | `copyPasteCollectClipsPreset` | **done** |
| `importAdjustmentSequence` | no | `copyPasteImportAdjustmentSequence` | **done** |
| `importColorMatteSequence` | no | `copyPasteImportColorMatteSequence` | **done** |
| `prepareToPastePreset` | **yes** | `copyPastePrepareToPastePreset` | **done** |
| `detouchPreset` | **yes** | `copyPasteDetouchPreset` | **done** |
| `resolveMissingFootages` | no | `copyPasteResolveMissingFootages` | **done** |

**Exit phase 5:** all rows **done**; `copy-paste-apply.ts` uses only `evalTS`; `pp_composer.jsx` removed from loader.
