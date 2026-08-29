# Backend: CEP Spunkram Library ↔ Motionflow API

Документ для backend-команды. **Вся entitlement-логика (автор, sold_items, подписка) живёт на сервере.**  
CEP знает только `client: "spunkram-cep"` + Bearer и рисует UI по готовым флагам.

**Локальные пути:** см. [`PATHS.md`](./PATHS.md) (Spunkram Beta + next-app).

Клиентские модули:

- `src/js/api/motionflow-auth.ts` — auth / me / devices
- `src/js/api/cep-market.ts` — каталог + download/install/diff: `GET /api/cep/market`, Bearer download, `POST /api/cep/market/diff`
- `src/js/lib/api/stock-api.ts` — footages: `/api/stock/unsplash`, `/pexels/videos`, `/download`
- `src/js/lib/api/market-api.ts` — shared helpers only (no AtomX)
- `src/js/api/credits.ts` — баланс генераций
- `src/js/api/telemetry.ts` — session + installs + active packs telemetry
- `src/js/api/config.ts` — пути эндпоинтов

Base URL (Motionflow): **`https://motionflow.pro`**  
Auth: **`Authorization: Bearer <token>`**.

Каталог паков: **`GET /api/cep/market?host=AE|PR`** (author resolved from `client` on server).  
Canonical contract: next-app `CEP_API.md`. AtomX MAU **removed** (Отречение).

---

## Принцип безопасности

| CEP получает | CEP **не** получает / не шлёт |
|---|---|
| `subscription.active`, `plan`, `renews_at` | `author_id`, raw `sold_items` |
| паки автора для `host=AE\|PR` | внутренние DB id автора |
| на паке: `owned`, `action`, `buy_url`, `install_url` | логику Creator + AI vs Spunkram |
| `tier` + `entitlements.ai_generations_limit` | клиентский фильтр покупок |

Платформенная подписка Motionflow (**Creator + AI**) **игнорируется** для Spunkram.  
Учитываются только подписка и `sold_items` автора, привязанного к `client`.

---

## 0. Client registry (внутренний)

| `client` | `author_id` (DB) | `extension_name` | Login copy |
|---|---|---|---|
| `spunkram-cep` | `1691` | `Spunkram` | Sign in to the Spunkram extension |

- Маппинг **только на сервере**. CEP никогда не шлёт `author_id`.
- При `POST /api/cep/auth/device` сохранить `client` в device session / JWT claims.
- Все `/api/cep/*` с Bearer резолвят автора из `client` сессии.

---

## Приоритеты

| P | Что | Зачем |
|---|-----|--------|
| **P0** | Client registry + device login с `client` в JWT | Scope без утечки author_id |
| **P0** | `/me` с `tier` + subscription (без author_id) | Account / free vs subscribed |
| **P0** | `/api/cep/market?host=` + owned/action | Market Buy / Install |
| **P0** | Download gate по sold_items \| author sub \| free pack | Не обойти UI |
| **P1** | Generations limit по tier | 5 free / 10 Editor / 100 Editor AI |
| **P1** | `/spunkram?code=` login → Allow/Deny | «Sign in to the Spunkram extension» |

---

## 1. Авторизация (device-code flow)

```
CEP panel                         motionflow.pro                      Browser
   |                                    |                                 |
   |-- POST /api/cep/auth/device ------>|                                 |
   |   { usp, device, client }          |                                 |
   |<-- { code, device_code,            |                                 |
   |      verification_url } -----------|                                 |
   |-- open verification_url ------------------------------------------>|
   |                                    |<-- user signs in / confirms ----|
   |-- POST /api/cep/auth/token ------->|                                 |
   |<-- { status: complete, token } ----|                                 |
   |-- GET /api/cep/me + Bearer ------->|                                 |
```

### 1.1 `POST /api/cep/auth/device`

**Request**

```json
{
  "usp": "<encoded fingerprint string>",
  "device": {
    "mac": "aa:bb:…",
    "user": "windows-username",
    "os": "Windows 11 …"
  },
  "client": "spunkram-cep"
}
```

Только `client`. **Не** принимать / не требовать `author_id` / `extension` от CEP.

**Response `200`**

```json
{
  "code": "ABCD-1234",
  "device_code": "mfdev_<64 hex chars>",
  "verification_url": "https://motionflow.pro/spunkram?code=ABCD-1234&client=spunkram-cep",
  "interval": 3,
  "expires_in": 300
}
```

Сохранить `client` в device session. Неизвестный `client` → `400`.

### 1.2 Web: `/spunkram?code=…&client=spunkram-cep`

1. CEP открывает `https://motionflow.pro/spunkram?code=…&client=spunkram-cep`.
2. Если сессии нет → попап входа на сайте (`SignInModal`).
3. Если сессия есть (или после логина) → попап Allow / Deny.
4. Confirm → связать code с user; token poll несёт `client`.
5. Legacy `/cep/login?…` редиректит на `/spunkram?…`.

### 1.3 `POST /api/cep/auth/token`

```json
{ "code": "ABCD-1234", "device_code": "mfdev_…" }
```

Успех: `{ "status": "complete", "token": "…", "user": { "id", "email", "name?" } }`.  
Token обязан позволять серверу узнать `client` (claim или lookup).

**Лимит устройств (по умолчанию 3, `CEP_DEVICE_LIMIT`):** если у аккаунта уже max активных устройств и MAC не совпал, poll возвращает:

```json
{
  "status": "device_limit",
  "device_limit": 3,
  "devices": [
    {
      "id": "dev_…",
      "ip": "…",
      "user_fingerprint": "…",
      "name": "…",
      "last_seen_at": "…"
    }
  ],
  "message": "…"
}
```

Browser confirm при approve может вернуть `{ "ok": true, "status": "device_limit" }` — панель показывает picker и вызывает replace-device.

### 1.3b `POST /api/cep/auth/replace-device`

```json
{
  "code": "ABCD-1234",
  "device_code": "mfdev_…",
  "revoke_device_id": "dev_…"
}
```

Отзывает выбранное устройство пользователя сессии, создаёт новое + Bearer, публикует `device.revoked` (WS kick), ответ как у complete token poll.

### 1.4 `GET /api/cep/me`

**Headers:** `Authorization: Bearer <token>`

**Query (optional):** `host=AE|PR` — вернуть в `purchases` только паки этого хоста (дубликаты sold_items схлопываются по item).

Сервер: session → user + client → author → Spunkram subscription + sold_items.

```json
{
  "user": {
    "id": "user_…",
    "email": "user@example.com",
    "name": "Optional Name"
  },
  "tier": "free",
  "subscription": {
    "active": false,
    "plan": null,
    "status": null,
    "renews_at": null
  },
  "purchases": [
    {
      "id": "purchase_…",
      "name": "Pack name",
      "product_type": "pack",
      "primary_type": "AE"
    }
  ],
  "entitlements": {
    "free_pack_slots": 1,
    "ai_generations_limit": 5
  },
  "subscribe_url": "https://motionflow.pro/pricing?client=spunkram-cep",
  "manage_subscription_url": "https://motionflow.pro/profile/subscriptions?client=spunkram-cep",
  "devices": [
    {
      "id": "dev_…",
      "ip": "1.2.3.4",
      "user_fingerprint": "{\"mac\":\"…\",\"user\":\"…\",\"os\":\"…\"}",
      "name": "optional label",
      "current": true
    }
  ]
}
```

| Поле | Правило |
|------|---------|
| `tier` | `free` \| `purchased` \| `subscribed` — **только** по автору client |
| `subscription.active` | true только при авторской Spunkram-подписке; Creator + AI → false |
| `purchases[]` | sold_items пользователя по автору client; **без** `author_id`; у каждой записи `primary_type`: `AE` \| `PR` \| `null`. При `?host=AE\|PR` — только паки этого хоста (Resolve и др. не попадают) |
| `entitlements.ai_generations_limit` | free/purchased → `5`; Editor → `10`; Editor AI → `100` |
| `subscribe_url` / `manage_subscription_url` | опционально; CEP использует если есть |

**`401`** → клиент разлогинивает.

### Free tier

Нет авторской подписки и нет sold_items → `tier: "free"`:

| Что | Лимит |
|-----|--------|
| Free pack slots | **1** |
| AI generations | **5** (Editor **10** · Editor AI **100**) |

### 1.5 `POST /api/cep/devices/revoke`

```json
{ "device_id": "dev_…" }
```

Любой `2xx` = ok. Сервер публикует `device.revoked` → WS hub закрывает сокет (`4401 REVOKED`) сразу.

---

## 2. Market — `GET /api/cep/market?host=AE|PR`

**Headers:** `Authorization: Bearer <token>` (обязателен)

Сервер:

1. Резолвит автора по `client` из token.
2. Все паки автора с `primary_type` = host.
3. Join `sold_items` → `owned`.
4. Авторская подписка → `subscription_active` / `covered_by_subscription` / `action`.

```json
{
  "subscription_active": false,
  "subscribe_url": "https://motionflow.pro/pricing?client=spunkram-cep",
  "Packages": [
    {
      "id": "pack_…",
      "name": "Display name",
      "pack_name": "slug",
      "author": "Spunkram",
      "version": "1.0.0",
      "primary_type": "AE",
      "image_url": "https://…",
      "custom_price": 29,
      "video_id": "…",
      "owned": true,
      "covered_by_subscription": true,
      "action": "install",
      "install_url": "https://motionflow.pro/api/cep/market/download?pack_id=…",
      "buy_url": null
    },
    {
      "id": "pack_…",
      "name": "Other pack",
      "pack_name": "other",
      "primary_type": "AE",
      "image_url": "https://…",
      "custom_price": 19,
      "owned": false,
      "covered_by_subscription": true,
      "action": "buy",
      "install_url": null,
      "buy_url": "https://motionflow.pro/…/checkout?…"
    }
  ]
}
```

### Правила `action` (сервер считает)

| Условие | `action` | CEP кнопка |
|---|---|---|
| `owned` (sold_items) **или** `subscription_active` | `install` | **Install** |
| не owned и нет подписки | `buy` | **Buy** + «Available free with Spunkram subscription» |
| free-tier pack entitlement | `install` или `get_free` | Install / Get free |

Локально установленные паки CEP сам помечает Switch / Active.

---

## 3. Download / Install gate

`GET /api/cep/market/download?pack_id=` (prefer pack `install_url`):

- **Headers:** `Authorization: Bearer <token>`
- Success: **HTTP 302** → zip on CDN / short-lived R2 (panel follows redirects; **no** Bearer on final host)
- Gate: sold_items **or** author subscription **or** free-pack entitlement
- Else JSON (no redirect): `403` `{ "error": "NOT_OWNED" }` / `401 UNAUTHORIZED` / `404 NOT_FOUND` / `NO_DOWNLOAD`

CEP: `downloadAndInstallPack` → zip (cached under preferences `pack-cache/` until install succeeds; overwritten on re-download) → `installPackFromFile` → packages root (`absCustomAbsolutePath` / `AE|PR`).

Plaintext `.spunkram` JSON uses `settings` + `content` (tree). Legacy `structure` is still accepted and normalized to the in-memory `structure` field.

### 3.1 Incremental update — `POST /api/cep/market/diff`

When an installed pack has `manifest.json` and the market version differs, CEP posts the local manifest and receives a zip of only changed files from the R2 prefix `{stem}/` (stem = basename of `download_key` without `.zip`).

- **Auth / gate:** same as full download
- **Body:** `{ pack_id, manifest }` (array `[{path,hash,…}]` or `{files:{…}}`)
- **200:** `application/zip` + `X-Diff-Count` / `X-Delete-Count`
- **409 `NO_DIFF_SOURCE`:** no remote `{stem}/manifest.json` → client falls back to full zip

CEP: `downloadAndApplyPackDiff` / `downloadAndInstallOrUpdatePack`.

See next-app `CEP_API.md` §3b.

---

## 4. Stock (footages)

| Goal | Method | Path |
|------|--------|------|
| Unsplash images | `GET` | `/api/stock/unsplash?query&orientation&page&perPage` |
| Pexels videos | `GET` | `/api/stock/pexels/videos?…` |
| Download + attribution | `GET` | `/api/stock/download?provider&kind&id` |

Download accepts **web session cookie** or **CEP Bearer** (`mfcep_…`). Search is public (server holds Unsplash/Pexels keys).

CEP client: `src/js/lib/api/stock-api.ts`.

---

## 5. Extension update + ffmpeg

Used by the CEP panel for auto-update and runtime ffmpeg download.

### 5.1 `GET /api/cep/update`

Returns the Spunkram release manifest. **Bearer required** (signed-in CEP user). Anonymous → `401`.

- **Stable (any signed-in user):** R2 `public/downloads/spunkram/latest.json`
- **Beta (allowlisted only):** if the user is a beta-tester (`basepackagehelp@gmail.com`, or `SPUNKRAM_BETA_EMAILS`), and `beta.json` is newer than stable, that manifest is returned instead (`channel: "beta"`).

```json
{
  "version": "0.1.0",
  "zxpUrl": "https://cdn.motionflow.pro/public/downloads/spunkram/0.1.0/spunkram.zxp",
  "changelog": "## 0.1.0\n- …",
  "publishedAt": "2026-08-02T12:00:00.000Z",
  "channel": "stable",
  "ffmpeg": {
    "win": "https://cdn.motionflow.pro/public/downloads/ffmpeg/win/ffmpeg.exe",
    "mac": "https://cdn.motionflow.pro/public/downloads/ffmpeg/mac/ffmpeg-mac.zip"
  }
}
```

Before the first published release, `version` / `zxpUrl` may be `null`; `ffmpeg` URLs are still present.

### 5.1b `GET /api/cep/update/versions` (admin)

Bearer required. Email must be on the beta/admin allowlist (`basepackagehelp@gmail.com`, `admin@mail.ru`, or `SPUNKRAM_BETA_EMAILS`).

Lists every uploaded ZXP under `public/downloads/spunkram/{version}/spunkram.zxp` (newest first):

```json
{
  "current": { "stable": "0.4.2", "beta": "0.4.3-beta.1" },
  "versions": [
    { "version": "0.4.3-beta.1", "zxpUrl": "https://cdn…/spunkram.zxp", "channel": "beta" },
    { "version": "0.4.2", "zxpUrl": "https://cdn…/spunkram.zxp", "channel": "stable" }
  ],
  "betas": […],
  "stables": […]
}
```

CEP Settings → **Admin · Builds** shows this list and can install any build.

### 5.2 Public CDN keys (R2 `motionflow-public`)

| Key | Purpose |
|---|---|
| `public/downloads/ffmpeg/win/ffmpeg.exe` | Windows ffmpeg |
| `public/downloads/ffmpeg/mac/ffmpeg-mac.zip` | macOS ffmpeg archive |
| `public/downloads/spunkram/{version}/spunkram.zxp` | Signed extension package |
| `public/downloads/spunkram/latest.json` | Stable manifest for `/api/cep/update` |
| `public/downloads/spunkram/beta.json` | Beta manifest (gated by email) |

CEP downloads ffmpeg into userdata (not the extension folder) so ZXP overwrite updates do not delete it.

### 5.3 GitHub webhook — `POST /api/github/webhook`

- Verify `X-Hub-Signature-256` with `GITHUB_WEBHOOK_SECRET`
- Optional filter: `GITHUB_SPUNKRAM_REPO` (`org/repo`)
- On `release` `published` / `edited`: download `.zxp` asset → R2
- Prerelease / tag containing `-beta` → `beta.json`; otherwise `latest.json`
- Optional `GITHUB_TOKEN` if release assets need auth

### 5.4 Upload scripts (next-app)

```bash
node --env-file=.env scripts/upload-spunkram-ffmpeg.mjs --win=…/ffmpeg.exe --mac=…/ffmpeg-mac.zip
node --env-file=.env scripts/upload-spunkram-zxp.mjs --zxp=./dist/zxp/com.spunkramlibrary.cep.zxp --version=0.1.0
node --env-file=.env scripts/upload-spunkram-zxp.mjs --zxp=./x.zxp --version=0.1.1-beta.1 --channel=beta
```

After R2 upload the script calls **`POST /api/cep/update/notify`** with `Authorization: Bearer <CEP_RELEASE_TOKEN>` (same `mfcep_…` device token as a signed-in panel). The server checks the user, then publishes Redis `cep:extension`. Override URL with `CEP_UPDATE_NOTIFY_URL`. Notify failure does not fail the release.

CEP:

```bash
npm run release:beta   # bump x.y.z-beta.N → upload beta.json only
npm run release:patch  # from beta: promote to stable core; from stable: +patch → latest.json
```

### 5.5 CEP client behaviour

1. After sign-in → `GET /api/cep/update` (Bearer required)
2. If remote version > local (`package.json` / manifest) → banner (beta labeled for testers)
3. User clicks Update → download ZXP → unpack over `csi.getSystemPath("extension")` → `location.reload()`

### 5.6 Captions catalog version (`Base/manifest.json`)

Public R2 object (no auth). CEP uses it as a cheap signal to re-download cached caption **projects** (mogrt/aep), not the ZXP.

| Brand | URL |
|---|---|
| Spunkram | `https://cdn.motionflow.pro/Spunkram%20Captions/Base/manifest.json` |
| Gal | `https://cdn.motionflow.pro/Gal%20Captions/Base/manifest.json` |

```json
{ "version": "1.0.0" }
```

- CEP copies this to `%APPDATA%/spunkram-library/captions-base-manifest.json` (`fetchedAt` + `brand` added locally).
- First seen version is stored without mass re-download.
- When `version` changes, CEP re-checks every locally cached caption project via `POST /api/captions` (etag / content-hash still skip identical bytes).
- Bump `version` whenever files under `{Brand} Captions/Base/` (or other caption projects) change on CDN. If you skip the bump, panels keep stale local projects.

Client: `src/js/styles/api.ts` (`fetchCaptionsCdnBaseManifest`), `src/js/styles/sync.ts`. Paths: [`PATHS.md`](./PATHS.md).

---

## 6. Credits / generations

Кредиты и usage **scoped по `author_id`**:

| Scope | `author_id` | Где используется |
|---|---|---|
| Motionflow (платформа) | `0` | веб AI `/api/generations/*`, Paddle extra packs |
| Spunkram | `1691` | CEP captions / chapters / voiceover (`client` → registry) |

Таблицы: `user_generation_credits` PK `(user_id, author_id)`, `user_generations.author_id`, audit с `author_id`.  
`users.extra_generations_count` — зеркало **только** Motionflow (`author_id = 0`).

`POST /api/cep/generations` — Bearer; tier и баланс **автора** из `client` (не Motionflow extras):

```json
{
  "authenticated": true,
  "hasSubscription": false,
  "plan": "free",
  "remaining": 5,
  "subscription_generations_left": 5,
  "extra_generations_left": 100,
  "total_generations_left": 105
}
```

Free / purchased (без Spunkram sub) → **5**. Editor → **10**. Editor AI → **100**.

`total_generations_left` = author subscription/free remaining + author `user_generation_credits.extra_balance` (купленные extra этого автора, не сгорают). Motionflow extras в CEP **не** видны. При consume сначала квота автора, затем author extra.

Admin: `POST /api/admin/user-generation-credits` — optional `authorId` (default `0`).

Captions / chapters / voiceover: тот же Bearer; лимит и Spunkram-sub проверяет сервер.

---

## 6.0 Client environment telemetry

`POST /api/cep/telemetry/session` — после успешного `/me` (логин / гидрация сессии). Bearer **обязателен**.

Нужен, чтобы видеть, с каких версий AE/PR и ОС реально заходят (решение по поддержке CC2023 и старше).

**Request**

```json
{
  "client": "spunkram-cep",
  "extension_version": "0.7.7",
  "host": { "appId": "AEFT", "appName": "After Effects", "appVersion": "24.5.0" },
  "os": "Windows 11 …",
  "locale": "en-US"
}
```

**Response:** `202 { "ok": true, "inserted": true|false, "reason?": "deduped" }`  
Server dedupe: тот же user+device+host+os+extension в пределах ~12 часов → `inserted: false`.

Таблица: `cep_client_sessions` (миграция `db/migrations/2026_08_11_cep_client_sessions.sql`).  
Клиент: `src/js/api/telemetry.ts` → вызывается из `auth-context` после успешного `refreshProfile`.

### Pack installs snapshot

`POST /api/cep/telemetry/installs` — Bearer required.

```json
{ "packs": [{ "pack_id": 12, "version": "1.2.0" }] }
```

Full replace per device. Panel: after `/me`, market refresh, and successful install/update (`reportInstalledPacks`).

### Active packs snapshot

`POST /api/cep/telemetry/active-packs` — Bearer required.

```json
{ "pack_ids": [12] }
```

Send `[]` when nothing is active. Panel: when active pack path changes (`reportActivePacks`).

Пример агрегации:

```sql
SELECT host_app_id, host_version, COUNT(DISTINCT user_id) AS users
  FROM cep_client_sessions
 WHERE reported_at >= NOW() - INTERVAL 90 DAY
 GROUP BY host_app_id, host_version
 ORDER BY users DESC;

SELECT os, COUNT(DISTINCT user_id) AS users
  FROM cep_client_sessions
 WHERE reported_at >= NOW() - INTERVAL 90 DAY
 GROUP BY os
 ORDER BY users DESC;
```

---

## 6.1 Support / error reports → Telegram

`POST /api/cep/support/report` — CEP Error Observer. Bearer **опционален** (если есть — в Telegram добавляются email / user id).

**Env (next-app):**

| Var | Role |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot API token (общий с contact form) |
| `GROUP_CHAT_ID` | Группа / супергруппа support |
| `TOPIC_ID` | Forum topic id (`message_thread_id`) |

**Request**

```json
{
  "action": "voiceover.generate",
  "error": "Generation failed",
  "error_code": "TIMEOUT",
  "severity": "error",
  "stack": "…",
  "extension_name": "Spunkram Library",
  "extension_version": "0.4.4-beta.2",
  "host": { "appId": "PPRO", "appName": "Premiere Pro", "appVersion": "24.5" },
  "os": "Windows 11 …",
  "locale": "en-US",
  "client": "spunkram-cep",
  "occurred_at": "2026-08-02T17:09:00.000Z",
  "extra": { "item": "optional" }
}
```

**Severity**

| Level | Meaning | Telegram |
|---|---|---|
| `error` (default) | Irreversible failure of the intended action | yes |
| `warning` | Recoverable / user guidance / degraded | no |
| `info` | Diagnostics | no |

Клиент шлёт на backend только `error`. `warning`/`info` остаются в `console` (dev).  
Server также фильтрует: non-error → `202 { delivered: false }`.

**Response:** `202 { "ok": true, "delivered": true|false }` после принятия (Telegram best-effort).  
Rate limit: ~1 одинаковый report / мин на IP+action+error → `429 RATE_LIMITED`.

Клиент: `src/js/lib/support/error-observer.ts`  
- `reportSupportError(action, err, { severity?, …extra })`  
- `reportSupportWarning` / `reportSupportInfo`  
Не шлёт entitlement/auth business codes и user-guidance («Open a sequence…»).

---

## 7. CORS / CEP HTTP

Production CEP ходит Node `http(s)` без CORS.  
Vite-dev проксирует `/api/cep/*`, `/api/stock/*`, `/api/generations/*`.

---

## 8. Чеклист backend

- [ ] Registry: `spunkram-cep` → author 1691
- [ ] Device login сохраняет `client` в session/JWT
- [ ] `/spunkram?code=` → login modal (если нет сессии) → Allow/Deny
- [ ] `/me` без `author_id`; Creator + AI не даёт `subscription.active`
- [ ] `/me` purchases = sold_items автора
- [ ] `/market?host=` все паки автора + `owned` / `action` / urls
- [ ] Download gate server-side
- [ ] Generations: 5 free / 10 Editor / 100 Editor AI; credits + usage scoped by author_id (0 = Motionflow)
- [ ] В ответах CEP **нет** `author_id`
- [ ] `GET /api/cep/update` + R2 `latest.json`
- [ ] `POST /api/github/webhook` + `GITHUB_WEBHOOK_SECRET`
- [ ] ffmpeg binaries on public CDN
- [ ] `POST /api/cep/support/report` + `GROUP_CHAT_ID` / `TOPIC_ID`
- [ ] `POST /api/cep/telemetry/session` + таблица `cep_client_sessions`

---

## 9. Рекомендуемые коды ошибок

```json
{ "error": "UNAUTHORIZED", "message": "…" }
{ "error": "SUBSCRIPTION_REQUIRED", "message": "…" }
{ "error": "NOT_OWNED", "message": "…" }
{ "error": "GENERATION_LIMIT_REACHED", "message": "…" }
{ "error": "DEVICE_LIMIT", "message": "…" }
{ "error": "INVALID_CODE", "message": "…" }
{ "error": "RATE_LIMITED", "message": "…" }
{ "error": "UNKNOWN_CLIENT", "message": "…" }
```

---

## Контакты / синхрон

Перед мержем сверьте с:

1. `src/js/api/motionflow-auth.ts`
2. `src/js/api/cep-market.ts`
3. `src/js/api/update.ts`
4. `src/js/api/support.ts`
5. Этот файл
