# План полного переноса legacy → MotionFlow SDK

Исполняемый roadmap. Принципы и критерии done — в [`POLNOE_OTRECHENIE.md`](./POLNOE_OTRECHENIE.md).  
Инвентарь Beta → SDK — [`INVENTORY.md`](./INVENTORY.md). Правила добавления методов — [`AUTHOR_COOKBOOK.md`](./AUTHOR_COOKBOOK.md).

---

## 1. Baseline (сейчас)

| Метрика | Значение |
|---------|----------|
| Legacy JSX в `src/jsx/legacy/` | **0** — удалено (фаза 8) |
| Прогресс «Полного отречения» | **~95%** (фазы 1–8 done; QA checklist P0 open) |

### Host TS (runtime)

- Captions / chapters / styles / voiceover import
- `importMedia` / `importVoiceoverAudio`
- `bindPack` / `setEngine` (`shared/engine.ts`)
- PR undo groups, external asset import, Arabic text engine
- FULL_PROJECT copy/paste (`ppro-copy-paste.ts`)
- AE presets + text presets (`aeft-presets.ts`, `aeft-text-presets.ts`)
- AE composer (`aeft-composer.ts`) — applyComp, animators, tools
- PR toolbar tools (`ppro-tools.ts`)

### Dropped (не переносим)

| Feature | Reason |
|---------|--------|
| **Customizer UI** | Beta-only, не в Motionflow Library |
| `runPackageJSXBIN` | Plaintext packs only |

### Кто вызывает host TS

| Caller | Path |
|--------|------|
| `footage-grid` → `apply-item.ts` | AE: `applyPackItem` + composer context · PR: `applyPackItem` / copy-paste |
| `MotionFlow.loadHostScripts` | Bolt `jsx/index.js` only |
| SDK `AE.applyComp`, animators, tools | `evalTS` → `aeft-composer.ts` |
| SDK `AE.applyPreset`, `textPresets.*` | `evalTS` → `aeft-presets` / `aeft-text-presets` |
| SDK `PPRO.tools` | `evalTS` → `ppro-tools.ts` |

---

## 2. Целевая архитектура ✅

```
Panel / author scripts → MotionFlow.ts → evalTS → src/jsx/aeft|ppro|shared
```

**Done:** нет `src/jsx/legacy/`, нет `legacy-loader.ts`, нет runtime `loadLegacyJsx`.

---

## 3. Фазы — статус

| Фаза | Статус |
|------|--------|
| 0 — Preconditions | ~done (QA checklist open) |
| 1–3 — мелкие + engine | ✅ |
| 4 — Arabic | ✅ |
| 5 — FULL_PROJECT | ✅ |
| 6 — AE presets | ✅ |
| 7 — AE applyComp + animators | ✅ (`aeft-composer.ts`) |
| 8 — Cleanup | ✅ (legacy удалён, loader gone, vite plugin gone) |

---

## 4. Связанные документы

| Документ | Роль |
|----------|------|
| [`POLNOE_OTRECHENIE.md`](./POLNOE_OTRECHENIE.md) | Принципы, критерии done |
| [`AE_APPLYCOMP_PARITY.md`](./AE_APPLYCOMP_PARITY.md) | Phase 7 scope (historical) |
| [`INVENTORY.md`](./INVENTORY.md) | Beta → SDK map |
| [`PARITY.md`](./PARITY.md) | Intentional differences vs Beta |
| [`MOTIONFLOW_SDK.md`](../MOTIONFLOW_SDK.md) | Публичный API |

---

## 5. Оставшееся (не блокирует runtime)

- [ ] QA checklist Market AE+PR (`operaciya-otrechenie.md`)
- [ ] P0 hard-remove pack decrypt (отдельный трек)
- [ ] Optional: split `aeft-composer.ts` на submodules (7.x refactor)
- [ ] Optional: CI grep gate (8.4)
- [ ] Optional: internal marker rename `ATOM_*` → brand (8.5)
