# План полного переноса legacy → MotionFlow SDK

Исполняемый roadmap. Принципы и критерии done — в [`POLNOE_OTRECHENIE.md`](./POLNOE_OTRECHENIE.md).  
Инвентарь Beta → SDK — [`INVENTORY.md`](./INVENTORY.md). Правила добавления методов — [`AUTHOR_COOKBOOK.md`](./AUTHOR_COOKBOOK.md).

---

## 1. Baseline (сейчас)

| Метрика | Значение |
|---------|----------|
| Legacy JSX в `src/jsx/legacy/` | **5 файлов** (~285 KB): `engine`, `ae_composer`, `ae_preset_manager`, `ae_text_presets`, `pp_composer` |
| Прогресс «Полного отречения» | **~35–40%** (фазы 1–4 done, 5 partial) |

### Уже на TS (legacy не нужен в runtime)

- Captions / chapters / styles / voiceover import
- `importMedia` / `importVoiceoverAudio`
- `bindPack` / `setEngine` (`shared/engine.ts` + legacy bridge in host)
- PR undo groups (`ppro-undo-group.ts`)
- External asset import (`*-import-external.ts`)
- Arabic text engine (`aeft-text-arabic.ts`)
- FULL_PROJECT helpers (partial — [`COPY_PASTE_API.md`](./COPY_PASTE_API.md))

### Dropped (не переносим)

| Feature | Legacy | Reason |
|---------|--------|--------|
| **Customizer UI** | `customizeHandler`, `ae/pp_composer.customizer` | Не используется в Motionflow Library — Beta-only |
| `runPackageJSXBIN` | engine | Plaintext packs only |

### Ещё 100% legacy

| Файл | KB | Блокирует |
|------|-----|-----------|
| `pp_composer.jsx` | ~119 | FULL_PROJECT remainder, PR tools |
| `ae_composer.jsx` | ~96 | AE applyComp, animators, tools |
| `ae_preset_manager.jsx` | ~48 | `.ffx` presets |
| `ae_text_presets.jsx` | ~26 | text presets |
| `engine.jsx` | ~25 | `applyItem` global (unused from UI), pack FS helpers |

### Кто вызывает legacy сегодня

| Caller | Legacy path |
|--------|-------------|
| `footage-grid` → `apply-item.ts` | TS `applyPackItem` / `copy-paste-apply` (FULL_PROJECT) |
| `MotionFlow.loadHostScripts` | весь `LEGACY_ORDER` |
| `copy-paste-apply.ts` | `evalTS` (partial) + `$._copyPasteSystem.*` (legacy) |
| SDK `AE.applyComp`, animators, tools | `legacyAeCall` |
| SDK `PPRO.tools` | `legacyPpCall` |

---

## 2. Целевая архитектура

```
Panel / author scripts
        │
        ▼
src/js/sdk/MotionFlow.ts          ← единственная публичная поверхность
        │
   evalTS only (no evalES legacy)
        │
src/jsx/aeft/*.ts  src/jsx/ppro/*.ts  src/jsx/shared/*.ts
        │
src/bin/ (Motionflow.dll — native, не JSX)
```

**Done =** нет `src/jsx/legacy/`, нет `legacy-loader.ts`, нет `$._AtomExt_*` / `legacy*Call` / `loadLegacyJsx` в `src/`.

---

## 3. Матрица переноса (legacy → host TS)

Статусы: `done` · `partial` · `todo` · `drop`

### 3.1 Мелкие файлы (фазы 1–2)

| Legacy | SDK | Target host | Status |
|--------|-----|-------------|--------|
| `stockassets.jsx` | `importMedia` | `*-import-media.ts` | **done** |
| `undo_groups.jsx` | `PPRO.undoGroup.*` | `ppro-undo-group.ts` | **done** |
| `external_lib_import.jsx` | `importExternalAsset` | `*-import-external.ts` | **done** |
| `additional.jsx` | (ae_composer bridge) | `aeft-text-arabic.ts` | **done** |

### 3.2 Engine (фаза 3)

| Legacy global / method | SDK | Target | Status |
|------------------------|-----|--------|--------|
| `transferExeSwitchTrigger` | `bindPack` | `shared/engine.ts` + legacy bridge | **done** |
| `transferExeEngineSwitchTrigger` | `setEngine` | то же | **done** |
| `applyItem(...)` | → `applyPackItem` | removed from SDK | **done** |
| `customizeHandler` | — | **drop** | **drop** |
| `runPackageJSXBIN` | — | **drop** | done |
| pack eval helpers | `packs.*` | `shared/fs.ts` | done |

### 3.3 AE composer (фаза 7)

| Legacy method | SDK | Target host module | Status |
|---------------|-----|-------------------|--------|
| `applyComp` | `AE.applyComp` | `aeft-apply-comp.ts` | todo |
| `addTextAnimatorComp` | `AE.addTextAnimator` | `aeft-text-animator.ts` | todo |
| `addPhotoAnimatorComp` | `AE.addPhotoAnimator` | `aeft-photo-animator.ts` | todo |
| `customizer` / `editCustomizer` | — | — | **drop** |
| `buttons` | `AE.tools.run` | `aeft-tools.ts` | todo |
| folder / expression retarget | (internal) | `aeft-comp-structure.ts` | todo |
| time-remap / markers | (internal) | `aeft-layer-timing.ts` | todo |

### 3.4 AE presets (фаза 6)

| Legacy | SDK | Target | Status |
|--------|-----|--------|--------|
| `applyPreset` | `AE.applyPreset` | `aeft-presets.ts` | todo |
| preset `customizer` | — | — | **drop** |
| `textPresets.*` | `AE.textPresets.*` | `aeft-text-presets.ts` | todo |

### 3.5 Premiere composer (фаза 5)

| Legacy | SDK | Target | Status |
|--------|-----|--------|--------|
| `customizer` / `setCustomizeChanges` | — | — | **drop** |
| `buttonActions` | `PPRO.tools.run` | `ppro-tools.ts` | todo |
| `$._copyPasteSystem.*` | FULL_PROJECT | `ppro-copy-paste.ts` + один `applyFullProject` export | partial |
| `addMOGRT` (full) | `PPRO.addMogrt` | `ppro-sdk.ts` | **done** (упрощённый путь) |
| drag/drop / doubleClick apply | → `applyPackItem` | уже через TS / apply-item | partial |

---

## 4. Фазы и PR-нарезка

**Правило:** один PR = один legacy-файл из loader **или** один атомарный host-модуль.  
**Dual-run:** опционально env `MF_LEGACY_COMPOSER=1` на 1–2 релиза для AE applyComp; снять в фазе 8.

### Фаза 0 — Preconditions ✅ (~done)

- [x] Plaintext packs only
- [x] `runJsxbin` removed
- [ ] QA checklist Market AE+PR (см. `operaciya-otrechenie.md`)

### Фаза 1–3 ✅ — см. git commits `migration(phase-1|2|3|5)`

### Фаза 4 — Arabic ✅

| PR | Задачи | Exit |
|----|--------|------|
| **4.1** | `aeft-text-arabic.ts` + legacy bridge для `ae_composer` | additional.jsx out |

### ~~Customizer~~ — **drop**

Beta customizer UI не входит в Motionflow Library. `MotionFlow.customize.*` удалён из SDK. Legacy `customizeHandler` в `engine.jsx` уйдёт вместе с composers.

### Фаза 5 — FULL_PROJECT (2–3 недели, critical path) — **partial**

Инвентарь: [`COPY_PASTE_API.md`](./COPY_PASTE_API.md).

| PR | Задачи | Exit |
|----|--------|------|
| **5.1** ✅ | Inventory + non-DLL methods в `ppro-copy-paste.ts` | 7/16 calls на `evalTS` |
| **5.2** | DLL path: `initializeLibrary`, `executeCommand`, `prepareToPastePreset`, `detouchPreset` | host TS |
| **5.3** | Import/relink: `importSelectedItem`, `resolveMissingFootages`, PTX sequences | host TS |
| **5.4** | `copy-paste-apply.ts` только `evalTS`; delete `pp_composer.jsx` | PR composer gone |

### Фаза 6 — AE presets (1–2 недели)

| PR | Задачи | Exit |
|----|--------|------|
| **6.1** | `aeft-presets.ts`: `applyPreset` | ae_preset_manager partial |
| **6.2** | `aeft-text-presets.ts`: apply/get/remove | ae_text_presets out |

### Фаза 7 — AE applyComp + animators (3–4 недели, critical path)

| PR | Задачи | Exit |
|----|--------|------|
| **7.0** | Parity matrix: pack types × `applyComp` | scope doc |
| **7.1–7.6** | `aeft-apply-comp.ts`, animators, tools | ae_composer gone |

### Фаза 8 — Cleanup (3–5 дней)

| PR | Задачи | Exit |
|----|--------|------|
| **8.1** | Delete `src/jsx/legacy/`, `legacy-loader.ts`, vite copy plugin | no legacy dist |
| **8.2** | `loadHostScripts` = Bolt only | faster startup |
| **8.3** | Update `MOTIONFLOW_SDK.md`, `INVENTORY.md`, `PARITY.md` | docs |
| **8.4** | CI: `AtomExt|legacyAeCall|legacyPpCall|jsx/legacy|loadLegacyJsx` | gate |
| **8.5** | Rename internal markers (`ATOM_*` → `SPUNKRAM_*`) — **отдельный track** + re-export паков | branding |

---

## 5. QA matrix (минимум на каждую фазу)

| Сценарий | AE | PR |
|----------|----|----|
| Market install pack | ✓ | ✓ |
| Apply MOGRT | n/a | ✓ |
| Apply FOOTAGE / AUDIO | ✓ | ✓ |
| Apply FULL_PROJECT | n/a | ✓ |
| Apply `.aep` / complex comp | ✓ | n/a |
| ~~Customizer~~ | — | — |
| `.ffx` preset apply | ✓ | n/a |
| Text preset apply/remove | ✓ | n/a |
| Text / photo animator | ✓ | n/a |
| Captions (regression) | ✓ | ✓ |
| External asset import | ✓ | ✓ |
| Undo после FULL_PROJECT | n/a | ✓ |

После фазы 6/7 — прогон **fixture packs** (2–3 этalon pack per host).

---

## 6. Оценка сроков

| Фаза | Сложность | Ориентир |
|------|-----------|----------|
| 1–4 | — | **done** |
| 5 | **XL** | 2–3 недели (partial) |
| 6 | M | 1–2 недели |
| 7 | **XL** | 3–4 недели |
| 8 | S | 3–5 дней |

Critical path: **5 (FULL_PROJECT) → 7 (AE applyComp)**.

---

## 7. Риски и митигация

| Риск | Митигация |
|------|-----------|
| Customizer JSON ломает UI | **N/A — feature dropped** |
| AE expression retarget silent break | Fixture packs + compare project tree |
| FULL_PROJECT + DLL fragility | Port wrapper only; не трогать native |
| PR слишком большой | Жёсткая нарезка по PR-таблице |
| Порт «как есть» → legacy на TS | Атомарные exports, не monolith file |
| Marker rename ломает старые паки | Фаза 8.5 отдельно + composer re-export |

---

## 8. Немедленные next steps

1. **Phase 5.2** — DLL-backed copy/paste methods в `ppro-copy-paste.ts`.
2. **Phase 5.3** — import/relink + PTX sequences.
3. **Phase 7.0** — parity matrix AE applyComp (Market pack types).

---

## 9. Связанные документы

| Документ | Роль |
|----------|------|
| [`POLNOE_OTRECHENIE.md`](./POLNOE_OTRECHENIE.md) | Принципы, критерии done, философия атомарности |
| [`INVENTORY.md`](./INVENTORY.md) | Beta file → SDK method map |
| [`PARITY.md`](./PARITY.md) | Intentional differences vs Beta |
| [`MOTIONFLOW_SDK.md`](../MOTIONFLOW_SDK.md) | Публичный API reference |
| [`AUTHOR_COOKBOOK.md`](./AUTHOR_COOKBOOK.md) | Как добавлять методы |
