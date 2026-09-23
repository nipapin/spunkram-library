# Gal Toolkit MAX — бриф для установщика

Минимальный набор для другого автора. Источник правды в CEP: [`brands.config.ts`](../brands.config.ts) (`id: "gal"`). Текущий stable: **0.9.24**.

---

## 1. Название продукта

| Поле | Значение |
|---|---|
| Product name | **Gal Toolkit MAX** |
| Panel / меню AE & Premiere | **Gal Toolkit MAX** |
| Author / company | Premiere Gal |
| Storefront | https://premieregal.motionflow.pro |
| Хосты | After Effects (`AEFT`) и Premiere Pro (`PPRO`), версии `[25.0, 99.9]` |

Не путать с legacy **Gal Toolkit** (без MAX) — это другой sold item.

---

## 2. Логотип / иконка

Все файлы в репозитории CEP:

| Назначение | Файл | Вид |
|---|---|---|
| **Иконка продукта** (квадрат, градиент) | `src/js/ui/gal/assets/logo-mark.png` | кирпич «Gal», magenta → purple |
| **Монохром / boot** (белый знак) | `src/js/ui/gal/assets/logo.png` | тот же mark, белый на прозрачном |
| **Баннер установщика** | `src/js/ui/gal/assets/galheader.png` | абстрактный wash magenta / purple / cyan |

Для Windows `.ico` / macOS `.icns` брать **`logo-mark.png`** как мастер. Монохромный `logo.png` — для тёмного фона и splash.

CSXS-иконки панели в `cep.config.ts` сейчас общие Bolt (`src/assets/light-icon.png` / `dark-icon.png`) и **не Gal-specific**. Установщику их не копировать — использовать mark выше.

---

## 3. Токены (`:root`)

Источник: `src/js/themes/gal.scss` + `:root[data-brand="gal"]` в `src/js/themes/brands-runtime.scss`.

Шрифт: **Inter Variable** (Google / `@fontsource-variable/inter`). Акцент: magenta `#c31f93` → purple `#6b14d0`.

```css
:root {
  /* brand */
  --gal-primary-color: #c31f93;
  --gal-hover-color: #6b14d0;
  --gal-background-color: #222222;
  --gal-spot-color: #17181c;
  --gal-gradient: linear-gradient(to right, #c31f93, #6b14d0);

  /* surfaces */
  --bg-page: #222222;
  --bg-panel: #222222;
  --bg-header: #222222;
  --bg-tabbar: #2d2d2d;
  --bg-input: #2d2d2d;
  --bg-modal: #17181c;
  --card-gradient: #17181c;

  /* text */
  --text-primary: #ffffff;
  --text-muted: #999999;

  /* accent */
  --accent: #c31f93;
  --accent-2: #6b14d0;
  --accent-hover: #6b14d0;
  --accent-soft: rgba(195, 31, 147, 0.18);
  --accent-glow: rgba(195, 31, 147, 0.4);
  --accent-gradient: linear-gradient(to right, #c31f93, #6b14d0);
  --accent-gradient-hover: linear-gradient(to right, #d42aa5, #7c22e0);

  /* status */
  --success: #4ade80;
  --error: #ed553b;

  /* type */
  --font-sans: "Inter Variable", Inter, system-ui, sans-serif;
  --radius: 0.5rem;

  /* RGB-каналы (для rgba(var(--primary), a)) */
  --background: 34, 34, 34;
  --foreground: 255, 255, 255;
  --card: 23, 24, 28;
  --primary: 195, 31, 147;
  --muted: 45, 45, 45;
  --muted-foreground: 153, 153, 153;
  --destructive: 237, 85, 59;
  --ring: 195, 31, 147;
}
```

CTA в панели: градиент `--accent-gradient`, hover `--accent-gradient-hover`, тень `0 4px 18px rgba(195, 31, 147, 0.35)`.

---

## 4. `download.url` и путь CEP

Установщик качает **signed ZXP**, не папку `dist/`.

### URL

| Что | URL |
|---|---|
| **Pointer (всегда актуальный)** | `https://cdn.motionflow.pro/public/downloads/gal/latest.json` |
| **ZXP сейчас (0.9.24)** | `https://cdn.motionflow.pro/public/downloads/gal/0.9.24/gal.zxp` |
| Шаблон | `https://cdn.motionflow.pro/public/downloads/gal/{version}/gal.zxp` |
| Beta pointer | `https://cdn.motionflow.pro/public/downloads/gal/beta.json` |

`latest.json`:

```json
{
  "version": "0.9.24",
  "zxpUrl": "https://cdn.motionflow.pro/public/downloads/gal/0.9.24/gal.zxp",
  "channel": "stable",
  "product": "gal"
}
```

Для установщика: `download.url` = **`zxpUrl` из `latest.json`**, не хардкодить версию.

Локальный артефакт сборки: `dist/zxp/com.premieregal.cep.zxp` (`npm run zxp:gal`). На CDN файл всегда называется **`gal.zxp`**.

### Куда ставить CEP

Распаковать ZXP в папку **ровно с bundle id**:

| OS | Путь |
|---|---|
| Windows | `%APPDATA%\Adobe\CEP\extensions\com.premieregal.cep` |
| macOS | `~/Library/Application Support/Adobe/CEP/extensions/com.premieregal.cep` |

В корне расширения должны быть `CSXS/manifest.xml` и панель. Не класть внутрь ещё один `com.premieregal.cep`.

Dev-сборка (не для инсталлятора): `dist/cep-gal`.

---

## 5. Bundle id / ProductName

| Поле | Значение | Где живёт |
|---|---|---|
| **Bundle id / ExtensionBundleId** | `com.premieregal.cep` | CSXS, папка CEP, ZXP |
| **ExtensionBundleName / displayName** | `Gal Toolkit MAX` | CSXS, меню хоста |
| **panelDisplayName** | `Gal Toolkit MAX` | панель |
| **ProductName** | `Gal Toolkit MAX` | prefs / native installer |
| **CompanyName** | `Premiere Gal` | prefs |

Windows / macOS userdata (не трогать установщиком CEP, только не конфликтовать):

```
%APPDATA%\Premiere Gal\Gal Toolkit MAX\          # preferences.json, panel-store
%APPDATA%\gal-toolkit\                           # styles / effects cache
```

macOS: `~/Library/Application Support/…` с теми же сегментами.

API-клиент (логин / auto-update, не id расширения): `gal-cep`.

---

## Чеклист для команды установщика

- [ ] Имя в UI установщика: **Gal Toolkit MAX**
- [ ] Иконка: `logo-mark.png` → `.ico` / `.icns`
- [ ] Цвета кнопок / прогресса из `:root` выше
- [ ] Скачивать `zxpUrl` из `latest.json`
- [ ] Ставить в `…/Adobe/CEP/extensions/com.premieregal.cep`
- [ ] `ProductName` = `Gal Toolkit MAX`, bundle id = `com.premieregal.cep`
- [ ] Не пересекаться со Spunkram (`com.spunkramlibrary.cep`)
