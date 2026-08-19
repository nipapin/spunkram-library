# Parity: current `src/jsx` vs Spunkram Beta

| Capability | Beta | spunkram-library before SDK | After this SDK pass |
|---|---|---|---|
| Captions create/edit/resegment | partial / different | full (AE+PR) | same via `MotionFlow.*.createCaptions` |
| Chapters markers | — | full | SDK wrapped |
| Voiceover import | stock-like | full | SDK wrapped |
| Stock import | `stockassets.jsx` | `*-import-media.ts` | SDK; legacy supersed |
| Pack apply FULL_PROJECT | native copy/paste | `$._copyPasteSystem` + `copy-paste-apply.ts` | shipped DLL |
| Pack apply MOGRT (PR) | full `addMOGRT` + relink/fit | `importMGT` | SDK |
| Pack apply FOOTAGE/AUDIO | import + place | `ppro-apply-item` | SDK |
| Pack apply AEP (AE) | full composer | `aeft-composer.ts` via `applyPackItem` + composer context | SDK **ts** |
| AE `.ffx` presets | `aeft-presets.ts` | host TS |
| AE text presets | `aeft-text-presets.ts` | host TS |
| Text/photo animator | `aeft-composer.ts` | SDK **ts** |
| Customizer | AE+PR | — | **drop** |
| Undo groups (PR) | `ppro-undo-group.ts` | SDK **ts** |
| `createComp` / `createText` | ad-hoc inside composers | — | **new** TS host methods |
| Responsive background | not a named export | — | **new** `addResponsiveBackground` |
| Bolt `hello*` samples | n/a | exported on host | **not** on SDK surface |

## Intentional differences

1. **Apply path prefers plaintext packs**; soft-legacy Node-side decrypt remains for already-installed AtomX-era packs (reinstall CTA).
2. **No AtomX MAU** in host SDK — market is Motionflow `/api/cep/market` only.
3. Legacy Atom namespaces remain inside `src/jsx/legacy` until group 7 rename; public name is only `MotionFlow`.
