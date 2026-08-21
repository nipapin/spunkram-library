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
| **Styles / captions cache** | `%APPDATA%\spunkram-library\` (mac: `~/Library/Application Support/spunkram-library/`) — `styles-state.json`, `captions-base-manifest.json`, `styles/{safeId}/` |
| **Captions CDN Base manifest** | [cdn.motionflow.pro/Spunkram Captions/Base/manifest.json](https://cdn.motionflow.pro/Spunkram%20Captions/Base/manifest.json) |

Panel UI state (favorites, history, AI config, active pack, …) lives in **userdata**, not Chromium `localStorage` — see `src/js/lib/userdata-store.ts`. Auth/preferences remain in `…/Spunkram Extension/preferences.json`.

## Captions CDN catalog version

CEP watches a public version file on CDN and keeps a local snapshot. When that version **changes**, already-downloaded caption projects (`project.mogrt` / `project.aep`) are re-fetched.

| What | Path |
|---|---|
| Remote | `https://cdn.motionflow.pro/{Brand}%20Captions/Base/manifest.json` |
| Spunkram | `https://cdn.motionflow.pro/Spunkram%20Captions/Base/manifest.json` |
| Local snapshot | `%APPDATA%\spunkram-library\captions-base-manifest.json` |

Remote file:

```json
{
  "version": "1.0.0"
}
```

Local snapshot (written by CEP):

```json
{
  "version": "1.0.0",
  "fetchedAt": "2026-08-21T19:00:00.000Z",
  "brand": "spunkram"
}
```

Flow on panel load / Styles refresh (`src/js/styles/sync.ts`):

1. Show the catalog grid immediately (`checkRemoteUpdates: false`).
2. In the background, `GET` the CDN Base manifest.
3. If there is **no local snapshot** — save the current CDN version, do not mass-redownload.
4. If `version` **matches** — skip project downloads.
5. If `version` **changed** — refresh every local package that is still in the catalog (`POST /api/captions`, etag/hash skip if the file itself is unchanged). Persist the new version only if none of those refreshes failed (so a failed bump retries next launch).

**When you update caption projects on R2, bump `version` in Base/manifest.json.** Otherwise CEP will keep the old local mogrt/aep.

Code: `fetchCaptionsCdnBaseManifest` / `captionsCdnBaseManifestUrl` in `src/js/styles/api.ts`; disk IO in `src/js/styles/localStore.ts`.

## Extension id

| Bundle id | Menu name |
|---|---|
| `com.spunkramlibrary.cep` | **Spunkram Library** |

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
- Captions catalog version: `GET https://cdn.motionflow.pro/Spunkram%20Captions/Base/manifest.json` — bump `version` to make CEP re-download local mogrt/aep (see [Captions CDN catalog version](#captions-cdn-catalog-version))
- AtomX MAU / `get-atomx` / `atomx.plus` — **removed** (Операция «Отречение» завершена для CEP runtime)
