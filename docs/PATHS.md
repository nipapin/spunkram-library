# Project paths

Локальные пути, чтобы не искать / не копировать каждый раз.

| Что | Путь |
|---|---|
| **Этот репозиторий (CEP Spunkram Library)** | `C:\Users\nipap\Documents\motionflow\CEP\spunkram-library` |
| **Исходный проект (Spunkram Beta CEP)** | `C:\Users\nipap\AppData\Roaming\Adobe\CEP\extensions\Spunkram Beta` |
| **Сервер (Motionflow next-app)** | `C:\Users\nipap\Documents\motionflow\next-app\` |

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
