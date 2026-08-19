# AE applyComp — parity matrix (Phase 7.0)

Scope document for porting `ae_composer.jsx` → host TS.  
Related: [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) · [`PARITY.md`](./PARITY.md) · [`INVENTORY.md`](./INVENTORY.md).

**Exit 7.0:** this matrix + PR slice below — input for 7.1–7.6.

---

## 1. Two apply paths (critical context)

| Path | Caller today | Host entry | Used by Market UI? |
|------|--------------|------------|-------------------|
| **A — simplified** | `footage-grid` → `apply-item.ts` | `MotionFlow.applyPackItem` → `aeft-apply-item.ts` | **Yes** (double-click / apply) |
| **B — composer** | SDK `MotionFlow.AE.applyComp` | `legacyAeCall` → `ae_composer.applyComp` → `folderManager` | **No** (SDK / legacy `engine.applyItem` only) |

`engine.jsx` → `applyItem()` is **not** called from CEP panel TS anymore.  
Phase 7 goal: **unify path A with Beta parity from path B**, then delete `ae_composer.jsx`.

Recommended end state:

```
footage-grid → apply-item.ts → MotionFlow.applyPackItem (extended)
                                    ↓
                         aeft-apply-comp.ts (+ structure / timing modules)
```

SDK `MotionFlow.AE.applyComp` becomes thin alias or merges into `applyPackItem` payload shape.

---

## 2. AE pack engines (legacy routing)

From `engine.jsx` `applyItem` when `appID === "AE"`:

| Index | Engine id (typical) | Legacy handler | Phase | Market relevance |
|-------|---------------------|----------------|-------|------------------|
| `[0]` | Text preset engine | `$._AtomExt_aeTextPresets.*` | **6 ✅** | Packs with `engine` = text presets |
| `[1]` | Composer | `$._AtomExt_aeComposer.applyComp` | **7** | Default AE transitions/titles |
| `[2]` | Photo animator | `$._AtomExt_aeComposer.addPhotoAnimatorComp` | **7.4** | Photo-reactive packs |
| `[3]` | Text animator | `$._AtomExt_aeComposer.addTextAnimatorComp` | **7.3** | Kinetic text packs |
| `[4]`/`[5]` | Preset manager | `$._AtomExt_aePresetManager.applyPreset` | **6 ✅** | `.ffx` packs |

`settings.main.engine_pack` + per-item `getArguments.change_engine` select the row.

---

## 3. Market item types × resolver × composer

From `pack-apply-paths.ts` + pack tree flags (`pack-types.ts`):

| Tree flag / ctype | Resolved file | `applyPackItem` today | `folderManager` (Beta) | Gap |
|-------------------|---------------|----------------------|------------------------|-----|
| Default group → `.aep` | `PROJECT` | Import/reuse comp, add to active comp, `fitLayerScaleToComp` | Import to `{root}/{pack}/…`, **duplicate comp**, bin naming, full layer options | **Large** |
| `individual_comp` | per-item `{name}.aep` | Same simplified PROJECT | Same + per-item path | **Large** |
| `is_footage` | `FOOTAGE` | Import to bin, place, scale cover | `FTG_{group}` bin, label, blend, timing, markers | **Medium** |
| `is_audio` | `AUDIO` | Import to bin, place at CTI | `SFX_{group}` bin, timing, markers | **Medium** |
| `is_presets` | `UNSUPPORTED` | Error: unsupported | `layer.applyPreset(ffx)` on selection | **Not wired in UI** |
| MOGRT | — (AE) | `MOGRT_NOT_SUPPORTED_IN_AE` | n/a | n/a |

**Market hot path:** `PROJECT` + `FOOTAGE` + `AUDIO`.  
**Not in Market UI yet:** `is_presets` groups (need engine + path resolver work).

---

## 4. `folderManager` feature matrix (Beta applyComp)

Legend: ✅ = in `aeft-apply-item.ts` · ⚠️ = partial · ❌ = missing · 🚫 = drop (customizer / Beta-only)

### 4.1 Project bin structure

| Feature | Beta | TS today | Target module |
|---------|------|----------|---------------|
| Root folder (`Atom` → brand bin) | ✅ | flat `Spunkram Assets` | `aeft-comp-structure.ts` |
| Per-pack subfolder | ✅ | single shared bin | `aeft-comp-structure.ts` |
| Footage subfolder `FTG_*` / `SFX_*` | ✅ | shared bin | `aeft-comp-structure.ts` |
| Dedup by `itemGroup` comment | ✅ | by filename only | `aeft-comp-structure.ts` |
| Re-import skip if comp exists | ✅ | naive name search | `aeft-comp-structure.ts` |

### 4.2 Composition apply (non-footage)

| Feature | Beta | TS today | Target module |
|---------|------|----------|---------------|
| Import `.aep` | ✅ | ✅ | `aeft-apply-comp.ts` |
| Duplicate before place | ✅ | ❌ (uses source comp) | `aeft-apply-comp.ts` |
| Unique dup name `[groupId]` | ✅ | ❌ | `aeft-comp-structure.ts` |
| `duplicateChildrenCompositions` | ✅ | ❌ | `aeft-comp-structure.ts` |
| `auto_size_composition` pack option | ✅ | ❌ (only layer FIT) | `aeft-apply-comp.ts` |
| `auto_fps_composition` | ✅ | ❌ | `aeft-apply-comp.ts` |
| `template_protection_ffx` | ✅ | ❌ | **P2** or drop |
| Expression retarget on dup | ✅ | ❌ | `aeft-comp-structure.ts` |
| `customizer` / pseudo effects | ✅ | 🚫 dropped | — |

### 4.3 Per-item `custom_args` (preview entry)

| `custom_args` key | Beta | TS today | Target module |
|-------------------|------|----------|---------------|
| `comp_name` | ✅ | uses `itemName` | `aeft-apply-comp.ts` |
| `layer_sets` (`3D:ADJUSTMENT:…`) | ✅ | ❌ | `aeft-apply-comp.ts` |
| `layer_timing` / time-remap | ✅ | ❌ | `aeft-layer-timing.ts` |
| `layer_marker` | ✅ | ❌ | `aeft-layer-timing.ts` |
| `layer_blendmode` | ✅ | ❌ | `aeft-layer-timing.ts` |
| `layer_fx` (Slider/Checkbox/…) | ✅ | ❌ | **P2** |
| `layer_precomp` (`TRANS`) | ✅ | ❌ | **P2** |
| `layer_null_external` | ✅ | ❌ | **P3** |
| `layer_relink_comp_marker` | ✅ | ❌ | **P3** (ionestudio niche) |
| `individual_comp` | ✅ (path) | ✅ (path only) | — |

Group-level overrides (`change_auto_size_composition`, `change_duplicate_origin_setting`, `change_use_start_timeline_pointer`, `change_layer_index_position`) — same modules as pack options.

### 4.4 Footage / audio place

| Feature | Beta | TS today | Target module |
|---------|------|----------|---------------|
| Place at CTI | ✅ | ✅ | — |
| `applyAutoSizeForFootage` / cover | ✅ | ✅ (`fitLayerScaleToComp`) | — |
| Label color (`label_color_num`) | ✅ | ❌ | `aeft-apply-comp.ts` |
| `timeLinePointerSettings` | ✅ | ❌ | `aeft-layer-timing.ts` |
| `doAutoSizeFootageInAE` ALL_ITEMS | ✅ | always on FOOTAGE | verify parity |

### 4.5 Presets inside composer (`is_presets` in args)

| Feature | Beta | TS today | Notes |
|---------|------|----------|-------|
| `layer.applyPreset(ffx)` on selection | ✅ | ❌ | Wire via `pack-apply-paths` + `applyPreset` (phase 6) |

---

## 5. Related composer surfaces (not applyComp)

| SDK method | Legacy | UI today | Phase |
|------------|--------|----------|-------|
| `AE.addTextAnimator` | `addTextAnimatorComp` | SDK only | 7.3 |
| `AE.addPhotoAnimator` | `addPhotoAnimatorComp` | SDK only | 7.4 |
| `AE.tools.run` | `ae_composer.buttons` | SDK only | 7.5 |
| `customizer` / `editCustomizer` | ae/pp composer | 🚫 dropped | — |

### `AE.tools.run` button types (inventory)

| Type | Section | Port priority |
|------|---------|---------------|
| `time_remap_simple` | TIMING | P1 |
| `time_remap_in_out_reverse` | TIMING | P1 |
| `reverse_timing` | TIMING | P1 |
| `time_remap_loop_aa` | TIMING | P2 |
| `remove_unused` | DEFAULT | P1 |
| `remove_unused_selection` | DEFAULT | P1 |
| `resize_items` | DEFAULT | P1 |
| `fix_arabic_lang` | DEFAULT | ✅ (`aeft-text-arabic.ts`) — wire in 7.5 |

---

## 6. Priority tiers for port

### P0 — Market regression blockers (7.1–7.2)

Must match current author packs on double-click apply:

1. Project bin layout (`Spunkram` / pack / group) + comp dedup by group id  
2. **Duplicate comp** before placing on timeline (not master template)  
3. Layer scale to comp (already) + label color  
4. Basic `layer_sets` on placed layer  

### P1 — common pack options (7.2–7.3)

5. `auto_size_composition` / `FIT_TO_COMP`  
6. `timeLinePointerSettings` + `layer_timing` presets  
7. `layer_marker`, `layer_blendmode`  
8. Footage/audio bin naming (`FTG_` / `SFX_`)  

### P2 — author niche (7.4+ or document as unsupported)

- `duplicateChildrenCompositions` depth variants  
- `layer_fx`, `layer_precomp`  
- `template_protection_ffx`  
- Photo/text animator engines (separate modules, SDK-only today)  

### P3 — drop or defer

- Customizer / pseudo-effect UI  
- `layer_null_external`, `layer_relink_comp_marker`  
- Beta `recoveryOlderPackages` / Atom folder rename (`Atom` → brand) — **8.5** track  

---

## 7. PR slice (7.1–7.6)

| PR | Module | Scope | Depends |
|----|--------|-------|---------|
| **7.1** | `aeft-comp-structure.ts` | Bins, find/dedup, dup naming, `findInItems` port | — |
| **7.2** | `aeft-apply-comp.ts` | Extend PROJECT apply: import→dup→place; hook structure | 7.1 |
| **7.3** | `aeft-layer-timing.ts` | time-remap, markers, blend, timeline pointer | 7.2 |
| **7.4** | `aeft-text-animator.ts` | `addTextAnimatorComp` hot path | 7.1 |
| **7.5** | `aeft-photo-animator.ts` | `addPhotoAnimatorComp` | 7.1 |
| **7.6** | `aeft-tools.ts` | `buttons` / `AE.tools.run` | 7.3, arabic |

**Integration PR (after 7.2):** switch `apply-item.ts` AE branch from bare `applyPackItem` to composer payload (or fold into extended `applyPackItem`).

**Dual-run:** env `MF_LEGACY_COMPOSER=1` → fallback `legacyAeCall` until 7.6 QA green; remove in phase 8.

---

## 8. Payload contract (proposed for 7.1)

Extend `ApplyPackItemPayload` (or parallel `ApplyComposerItemPayload`) so one evalTS call carries what `folderManager` expects:

```ts
type ApplyComposerItemPayload = {
  itemId: string;
  itemName: string;
  instanceGroup: string;       // pathSegments joined
  args: PackPreviewItem;       // preview entry + custom_args
  extra: {
    filepath: string;
    last_group: string;
  };
  templatesDir: string;
  packName: string;
  packOptions: Record<string, unknown>; // inside_option_sets
};
```

CEP side builds this in `apply-item.ts` from `PackTreeItem` + resolved file (today only sends `{ ctype, filePath, itemName, binName }`).

---

## 9. QA / fixture packs

Minimum manual matrix before removing `ae_composer.jsx`:

| # | Pack profile | Action | Assert |
|---|--------------|--------|--------|
| 1 | AE transitions (shared `.aep`) | Apply 3 items same group | 3 dup comps, correct bin, no master mutation |
| 2 | AE titles `individual_comp` | Apply | Per-item `.aep`, placed scaled |
| 3 | AE footage overlay | Apply | Cover scale, CTI place, FTG bin |
| 4 | AE SFX | Apply | Audio in SFX bin, timeline |
| 5 | Re-apply same item | Second apply | Reuses or duplicates per pack rules |
| 6 | Wrong host | Apply PR pack in AE | Friendly error (existing) |

Store 2–3 anonymized packs under `fixtures/packs/` when available (optional; not blocking 7.1).

---

## 10. Summary

| Area | Status |
|------|--------|
| Text presets | ✅ host TS |
| `.ffx` applyPreset | ✅ host TS |
| Market PROJECT/FOOTAGE/AUDIO | ⚠️ simplified TS — **main 7.x work** |
| `is_presets` UI apply | ❌ resolver blocks — wire in 7.x |
| Animators / tools | ❌ legacy only |
| Customizer | 🚫 dropped |

**Next step:** **7.1** — `aeft-comp-structure.ts` (bins + find/dedup + dup naming).
