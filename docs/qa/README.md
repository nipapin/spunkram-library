# Spunkram CEP — QA Checklists

Автономные HTML-страницы для ручного тестирования **панели CEP** (не сайта motionflow.pro).

## Как открыть

1. Открой в браузере [`index.html`](./index.html) (двойной клик или `file://`).
2. Прогресс чекбоксов сохраняется в **localStorage** этого браузера.
3. **Export JSON** — выгрузить отметки для отчёта.
4. Отмечай отдельно колонки **AE** и **PR**.

## Страницы

| Файл | Раздел |
|------|--------|
| [index.html](./index.html) | Оглавление + общий прогресс |
| [shell.html](./shell.html) | Shell, nav, auth, account, settings, update |
| [market.html](./market.html) | Market catalog & install |
| [editing.html](./editing.html) | Editing workspace & pack apply |
| [captions.html](./captions.html) | Captions AI tool |
| [styles.html](./styles.html) | Caption styles & presets |
| [chapters.html](./chapters.html) | Chapters AI tool |
| [voiceover.html](./voiceover.html) | Voiceover AI tool |
| [footages.html](./footages.html) | Stock footages |

## Smoke vs full

**Smoke (~30 мин / хост):** пункты в блоке на главной странице.

**Full regression:** все чекбоксы на AE 2024+ и PR 2024+ с аккаунтами free + subscribed.

## Регенерация страниц

Если меняется набор тестов, правь `build-pages.mjs` и `assets/qa-keys.js`, затем:

```bash
node docs/qa/build-pages.mjs
```

`shell.html` редактируется вручную (не генерируется скриптом).
