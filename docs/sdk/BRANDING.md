# Branding: единое имя Motionflow

Цель: в коде, UI и host-путях **один продукт — Motionflow**. Старые имена (Spunkram, Atom, Aniom, AtomExt) не добавляем в новый код.

Единый конфиг: [`brands.config.ts`](../../brands.config.ts) (`BRAND`).

---

## Уже Motionflow

| Область | Константа / имя |
|---------|-----------------|
| Публичный SDK | `Motionflow` (`src/js/sdk/Motionflow.ts`) |
| Auth / API types | `MotionflowAuth`, `MotionflowDevice`, … |
| Prefs path | `%AppData%/Motionflow/Motionflow Extension/` |
| Panel store | `%AppData%/Motionflow/Motionflow Library/` |
| Pack extension (primary) | `.motionflow` (`.spunkram` принимается до composer) |
| AE/PR bins | `Motionflow Styles`, `Motionflow Captions` |
| Native seeds | `%USER_DATA%/Adobe/Common/Motionflow/` |
| Storage keys | `motionflow.*` |

---

## Намеренно не меняем (пока)

| Что | Почему |
|-----|--------|
| CEP extension id `com.spunkramlibrary.cep` | Смена = новая установка, потеря авто-update у текущих пользователей |
| API client `spunkram-cep` | Контракт next-app `/api/cep/*`; менять с бэкендом |
| CSS classes `spunkram-shell`, `spunkram.scss` | Внутренние; отдельный PR без функциональных изменений |
| Repo / npm name `spunkram-library` | GitHub / CI; не влияет на продукт в Adobe |
| `Motionflow.dll` | Уже Motionflow |

---

## Legacy JSX (до MIGRATION_PLAN фаза 8)

В `src/jsx/legacy/*` остаются Atom/Aniom в markers и `$._AtomExt_*` — убираются при переносе host TS, не отдельным rename PR.

---

## Чеклист для нового кода

- [ ] Строки UI → `BRAND.authorName` / `BRAND.displayName`
- [ ] Storage keys → `storageKey("…")` из `brands.config.ts`
- [ ] Packs → `BRAND.packExtension` / `PACKAGE_FILE_EXTENSIONS`
- [ ] Host bins → `BRAND.stylesBin`, `BRAND.captionsBin`
- [ ] SDK imports → `import { Motionflow } from "@/sdk"`
- [ ] Не добавлять Spunkram / Atom / Aniom в новые идентификаторы

---

## Следующие шаги (опционально)

1. Composer / Market: публиковать только `.motionflow`, убрать `legacyPackExtension`
2. next-app: alias `motionflow-cep` → `spunkram-cep`
3. Новый CEP id + migration installer (major release)
4. CSS: `spunkram-*` → `motionflow-*`
5. Host markers `ATOM_*` → `MOTIONFLOW_*` + re-export паков
