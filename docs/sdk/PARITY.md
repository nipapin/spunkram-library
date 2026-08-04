# Parity: current `src/jsx` vs Spunkram Beta

| Capability | Beta | spunkram-library before SDK | After this SDK pass |
|---|---|---|---|
| Captions create/edit/resegment | partial / different | full (AE+PR) | same via `MotionFlow.*.createCaptions` |
| Chapters markers | — | full | SDK wrapped |
| Voiceover import | stock-like | full | SDK wrapped |
| Stock import | `stockassets.jsx` | `*-import-media.ts` | SDK; legacy supersed |
| Pack apply MOGRT (PR) | full `addMOGRT` + relink/fit | simplified `importMGT` | SDK `addMogrt` + legacy available |
| Pack apply PROJECT/AEP | full composer | simplified import | SDK + legacy `applyComp` |
| Pack apply FULL_PROJECT | native copy/paste | mapped to PROJECT | still no native DLL |
| AE `.ffx` presets | `ae_preset_manager` | UNSUPPORTED in path resolver | legacy in repo; SDK wrapped |
| AE text presets | `ae_text_presets` | — | legacy + SDK |
| Text/photo animator | `ae_composer` | — | legacy + SDK |
| Customizer | AE+PR | — | legacy + SDK |
| Undo groups (PR) | `undo_groups.jsx` | — | legacy + SDK |
| `createComp` / `createText` | ad-hoc inside composers | — | **new** TS host methods |
| Responsive background | not a named export | — | **new** `addResponsiveBackground` |
| Bolt `hello*` samples | n/a | exported on host | **not** on SDK surface |

## Intentional differences

1. **Apply path stays Node-side decrypt** then host plaintext — no `$._pack` JSXBIN requirement for new packs.
2. **No AtomX MAU** in host SDK.
3. Legacy Atom namespaces remain inside `src/jsx/legacy` until group 7 rename; public name is only `MotionFlow`.
