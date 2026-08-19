# FULL_PROJECT — `$._copyPasteSystem` inventory

Used by [`copy-paste-apply.ts`](../../src/js/lib/utils/copy-paste-apply.ts).  
Target host module: [`ppro-copy-paste.ts`](../../src/jsx/ppro/ppro-copy-paste.ts).

Native **`Motionflow.dll`** is not reimplemented — only TS orchestration moves off `pp_composer.jsx`.

## Port status

| Method | DLL? | Host TS export | Status |
|--------|------|----------------|--------|
| `getAppPrefs` | no | `copyPasteGetAppPrefs` | **done** |
| `checkForDuplicatesOfAuthorFolder` | no | `copyPasteCheckForDuplicatesOfAuthorFolder` | **done** |
| `createStructure` | no | `copyPasteCreateStructure` | **done** |
| `getMetadata` | no | `copyPasteGetMetadata` | **done** |
| `isSelectedItemExists` | no | `copyPasteIsSelectedItemExists` | **done** |
| `getSelectedItem` | no | `copyPasteGetSelectedItem` | **done** |
| `isResolutionExists` | no | `copyPasteIsResolutionExists` | **done** |
| `importSelectedItem` | no | — | legacy |
| `initializeLibrary` | **yes** | — | legacy |
| `executeCommand` | **yes** | — | legacy |
| `collectClipsPreset` | QE | — | legacy |
| `importAdjustmentSequence` | no | — | legacy |
| `importColorMatteSequence` | no | — | legacy |
| `prepareToPastePreset` | **yes** | — | legacy |
| `detouchPreset` | **yes** | — | legacy |
| `resolveMissingFootages` | no | — | legacy |

## Still via `evalES` → `$._copyPasteSystem` (phase 5 remainder)

- `importSelectedItem`
- `initializeLibrary` / `executeCommand`
- `collectClipsPreset`
- `importAdjustmentSequence` / `importColorMatteSequence`
- `prepareToPastePreset` / `detouchPreset`
- `resolveMissingFootages`

**Exit phase 5:** all rows **done** in `ppro-copy-paste.ts`; `copy-paste-apply.ts` uses only `evalTS`; `pp_composer.jsx` removed from loader.
