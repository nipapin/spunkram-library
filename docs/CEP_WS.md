# CEP WebSocket + session security

Mirror of next-app `docs/CEP_WS.md` for panel developers.

## Connect

`wss://motionflow.pro/api/cep/ws`

1. Open socket (no token in URL).
2. Send `{ "type": "auth", "token": "mfcep_…" }`.
3. On `{ "type": "auth.ok" }` send `{ "type": "hello", "host": "AE"|"PR" }`.
4. Receive pack / extension / revoke events.

Invalid/revoked token → close `4401`.

## Presence

Hub sets Redis `cep:presence:dev:{deviceId}` (TTL 90s) on `auth.ok` and refreshes on `ping`. Cleared on close. Admin UI uses this for Online/Offline.

## Pack events (`cep:events:{authorId}`)

| type | When |
|------|------|
| `pack.created` | Visibility on |
| `pack.updated` | Metadata/zip change |
| `pack.deleted` | Soft-delete / visibility off |

## Extension update (`cep:extension`)

`{ "type": "extension.update", "version", "zxp_url?", "changelog?", "channel?", "published_at?", "ts" }`

Re-check `GET /api/cep/update` before showing the banner.

## Device revoke (`cep:device`)

Server payload: `{ "type": "device.revoked", "user_id", "device_id", "ts" }` (numeric ids).

Client frame before close:

```json
{ "type": "device.revoked", "device_id": "dev_123", "ts": … }
```

Then close `4401` / `REVOKED`. Clear vault session and show login immediately.

## Device limit login

Default max **3** devices. Poll `POST /api/cep/auth/token` may return `status: "device_limit"` + `devices[]`. Finish with `POST /api/cep/auth/replace-device` `{ code, device_code, revoke_device_id }`.
