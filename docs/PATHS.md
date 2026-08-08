# Project paths

Локальные пути, чтобы не искать / не копировать каждый раз.

| Что | Путь |
|---|---|
| **Этот репозиторий (CEP Spunkram Library)** | `C:\Users\nipap\Documents\motionflow\CEP\spunkram-library` |
| **Исходный проект (Spunkram Beta CEP)** | `C:\Users\nipap\AppData\Roaming\Adobe\CEP\extensions\Spunkram Beta` |
| **Beta JSX port (legacy)** | `src/jsx/legacy/` → runtime `dist/cep/jsx/legacy/` |
| **MotionFlow SDK** | `src/js/sdk/` — see [`MOTIONFLOW_SDK.md`](./MOTIONFLOW_SDK.md) |
| **Сервер (Motionflow next-app)** | `C:\Users\nipap\Documents\motionflow\next-app\` |
| **Panel userdata store** | `%APPDATA%\Spunkram\Spunkram Library\panel-store.json` (mac: `~/Library/Application Support/Spunkram/Spunkram Library/panel-store.json`) |

Panel UI state (favorites, history, AI config, active pack, …) lives in **userdata**, not Chromium `localStorage` — see `src/js/lib/userdata-store.ts`. Auth/preferences remain in `…/Spunkram Extension/preferences.json`.

## Dev vs prod extension id

| Mode | Bundle id | Menu name |
|---|---|---|
| Local (`dev` / `watch` / `build` / `symlink`) | `com.spunkramlibrarydev.cep` | **Spunkram Library Dev** |
| `npm run zxp:dev` | `com.spunkramlibrarydev.cep` | **Spunkram Library Dev** |
| `npm run zxp` / `zip` / `release` | `com.spunkramlibrary.cep` | **Spunkram Library** |

Так можно держать установленный prod ZXP и параллельно symlink-dev панель.

## Release / auto-update

Из корня CEP:

```bash
npm run release:patch          # bump patch → zxp → git push + tag → R2 latest.json
npm run release:minor          # bump minor
npm run release:major          # bump major
npm run release:beta           # 0.4.2 → 0.4.3-beta.1 → R2 beta.json (tester-only)
npm run release                # текущая version из package.json
npm run release:dry            # показать шаги без выполнения
npm run release -- --no-upload # только git (если webhook уже заливает ZXP)
```

Нужен `next-app/.env` с R2 (или `NEXT_APP_ROOT` если путь другой). После upload: `GET https://motionflow.pro/api/cep/update`.
Beta видна только `basepackagehelp@gmail.com` (после логина в CEP). Промоут beta → stable: `npm run release:patch` (с `x.y.z-beta.N` снимет `-beta` → `x.y.z`).

## Полезные ориентиры в исходном проекте (историческое)

Beta reference only — CEP runtime no longer calls AtomX.

| Тема | Файл (Spunkram Beta) |
|---|---|
| Market UI / Packages | `js\popups.js` |
| Brand | `js\masked.js` |

## Market / stock (Motionflow)

- Market: `GET https://motionflow.pro/api/cep/market?host=AE|PR` + Bearer — see next-app `CEP_API.md` / [`BACKEND_CEP_API.md`](./BACKEND_CEP_API.md)
- Download: `GET /api/cep/market/download?pack_id=` (Bearer, follow redirects)
- Footages: `GET /api/stock/unsplash`, `/api/stock/pexels/videos`, `/api/stock/download`
- AtomX MAU / `get-atomx` / `atomx.plus` — **removed** (Операция «Отречение» завершена для CEP runtime)
