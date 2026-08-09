# Операция «Отречение» — задачи CEP (Spunkram Library)

План отказа CEP-панели от **`api.get-atomx.com`** / **`atomx.plus`** и полного перехода на **Motionflow next-app** + **R2 signed links**.

Зеркало по серверным задачам:  
`next-app/docs/operaciya-otrechenie.md`

Локальные пути: [`PATHS.md`](./PATHS.md). Текущий контракт API: [`BACKEND_CEP_API.md`](./BACKEND_CEP_API.md) · next-app `CEP_API.md`.

Host/SDK выход из Beta JSX (отдельный трек): [`sdk/POLNOE_OTRECHENIE.md`](./sdk/POLNOE_OTRECHENIE.md).

---

## Цель для панели

| Сейчас | После «Отречения» |
|--------|-------------------|
| Каталог: только `GET /api/cep/market` | Done |
| Footages: `motionflow.pro/api/stock/*` | Done |
| `client: spunkram-cep` (no AtomX bases) | Done |
| Decrypt BIN_AX / MG_ASSET | Soft-legacy decode + reinstall CTA; hard-remove after plaintext Market QA |

Критерий runtime: в `src/` нет URL `get-atomx.com` / `atomx.plus`.

---

## Фазы CEP

### Фаза 0 — Контракт с next-app (P0)

- [x] Сверить поля `CepMarketPackage` с `/api/cep/market` (без MAU-merge).
- [x] Install flow: Bearer → follow redirects → zip → `installPackFromFile`; `403 NOT_OWNED`.
- [x] Обновить `BACKEND_CEP_API.md` § Market / Download / Stock.

### Фаза 1 — Market только через Motionflow (P0)

- [x] `fetchCepMarket`: один `GET /api/cep/market?host=`
- [x] UI Buy / Install из `action` / urls сервера
- [x] Убрать `fetchMau` / `API_SERVERS` / `MASKED.author`
- [x] Install: Bearer download + `_ABS`

### Фаза 2 — Footages → `/api/stock/*` (P1)

- [x] `fetchMedia` → unsplash / pexels stock routes
- [x] Import via `/api/stock/download` (Bearer); no `track_download`
- [x] next-app download accepts CEP Bearer

### Фаза 3 — Убрать дешифрование паков (P0/P1)

- [x] Soft legacy: decode still works + one-shot reinstall CTA
- [ ] Hard-remove `pack-protect` / encrypted branches after plaintext packs confirmed in Market

### Фаза 4 — Cutover и чистка (P2)

- [x] Grep: ноль `get-atomx` / `atomx.plus` / `external_lib_assets` / `track_download` / `mau?king` в `src/`
- [x] `PATHS.md` / `BACKEND_CEP_API.md` обновлены
- [ ] QA checklist AE + PR (manual)

---

## Чеклист готовности (CEP)

- [x] Market без `fetchMau`
- [x] Нет `API_SERVERS` AtomX в runtime
- [x] Footages только через `/api/stock/*`
- [x] Soft-legacy decode + CTA (hard-remove pending)
- [x] Docs PATHS + BACKEND обновлены
- [ ] QA на AE + PR пройден
