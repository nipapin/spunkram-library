# Project paths

Локальные пути, чтобы не искать / не копировать каждый раз.

| Что | Путь |
|---|---|
| **Этот репозиторий (CEP Spunkram Library)** | `C:\Users\nipap\Documents\motionflow\CEP\spunkram-library` |
| **Исходный проект (Spunkram Beta CEP)** | `C:\Users\nipap\AppData\Roaming\Adobe\CEP\extensions\Spunkram Beta` |
| **Сервер (Motionflow next-app)** | `C:\Users\nipap\Documents\motionflow\next-app\` |

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
npm run release:patch          # bump patch → zxp → git push + tag → R2 upload
npm run release:minor          # bump minor
npm run release:major          # bump major
npm run release                # текущая version из package.json
npm run release:dry            # показать шаги без выполнения
npm run release -- --no-upload # только git (если webhook уже заливает ZXP)
```

Нужен `next-app/.env` с R2 (или `NEXT_APP_ROOT` если путь другой). После upload: `GET https://motionflow.pro/api/cep/update`.

## Полезные ориентиры в исходном проекте

| Тема | Файл |
|---|---|
| Market MAU (`get-atomx` / `mau?king=`) | `js\sync.js` → `fetchMauData` |
| AtomX API bases | `js\headers.js` → `proxyServersURI` |
| Market UI / Packages | `js\popups.js` |
| Brand / king | `js\masked.js` |

## AtomX MAU

- Prod: `https://api.get-atomx.com/atomx/v1/mau?king=SpunkramTemp`
- Fallback: `https://atomx.plus/atomx/v1/mau?king=SpunkramTemp`
- CEP-клиент: `src/js/lib/api/market-api.ts` → `fetchMau`
