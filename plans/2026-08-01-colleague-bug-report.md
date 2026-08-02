# План: фидбек коллеги (голосовой отчёт 01.08.2026)

Источник: `spunkram-bugs.txt` (расшифровка голосовых сообщений).

## Сводка

| # | Тип | Приоритет | Суть |
|---|-----|-----------|------|
| 1 | UX | Medium | Смена активного пака слишком далеко от Market |
| 2 | Bug | High | Превью залипают / накладываются при быстром hover |
| 3 | Bug | High | В list view вертикальные шаблоны становятся горизонтальными |
| 4 | UX/Bug | Medium | Непонятные иконки размера / focus mode; Scan «ничего не делает» |
| 5 | Bug | Low–Medium | Регулировка размера (Scan / slider) не работает в list view |

---

## 1. Быстрый доступ к установленному паку из Market

**Проблема.** После Install в Market карточка показывает только «Installed». Чтобы открыть/активировать пак, нужно идти через аватар → Settings → Installed Packs → Switch. Путь слишком длинный.

**Цель.** Рядом с «Installed» (или вместо disabled-кнопки) дать действие **Open / Switch**, которое сразу активирует пак и переключает UI на библиотеку.

**Где смотреть**
- `src/js/components/market-panel.tsx` — `actionForItem`, `MarketCard`
- `src/js/main/main.tsx` — `applyPack` / `loadInstalledPack`
- `src/js/components/settings-panel.tsx` — уже есть Switch для установленных паков (можно переиспользовать паттерн)

**Шаги**
1. Для `installed === true` показывать кнопку **Open** (не disabled «Installed»).
2. По клику: активировать соответствующий `InstalledPackMeta` через тот же путь, что Settings → Switch.
3. После активации увести пользователя в media/toolbar view (закрыть market nav).
4. Опционально: в Market tab «Installed» дублировать список установленных с быстрым Open.

**Критерий готовности.** Из Market на установленном паке один клик → пак активен и виден в библиотеке.

---

## 2. Залипающие / накладывающиеся preview при быстром hover

**Проблема.** В wedding-паке (переходы) при быстром движении мыши превью продолжают играть. Один клип (например Leaks) залипает в loop, пока соседние тоже стартуют → нахлёст звука/видео.

**Цель.** В каждый момент играет не больше одного hover-preview (если глобальный Play Preview выключен). На `mouseleave` / смене карточки воспроизведение гарантированно останавливается.

**Где смотреть**
- `src/js/components/footage-grid.tsx` — `hovered`, `showMotion`, `handleEnter` / `handleLeave`, `video.play()` / `pause()`
- `src/js/lib/panel-ui-context.tsx` — `playPreview`, `hoveredItemName`
- `src/js/components/PresetGrid.tsx` — похожая hover-логика (проверить на консистентность)

**Гипотезы**
- `mouseleave` не успевает / теряется при быстром скролле между карточками.
- `motionUrl` и `<video>` остаются смонтированными после leave; `pause()` не вызывается или race с новым `play()`.
- Focus/blur vs pointer events расходятся.
- Несколько карточек одновременно в `hovered === true`.

**Шаги**
1. Воспроизвести на wedding transitions: быстрый проезд мыши + залипание одного клипа.
2. Ввести единый «active hover preview id» в контексте (или ref на уровне грида): play только у текущего id.
3. На leave: `pause()`, `currentTime = 0`, сброс hovered; при необходимости отменять in-flight `play()` promise.
4. Проверить GIF-motion отдельно (не video API).
5. Регресс: глобальный Play Preview (все играют) не должен сломаться.

**Критерий готовности.** Быстрый проезд по сетке не оставляет играющих клипов; одновременно не больше одного hover-preview.

---

## 3. List view ломает aspect ratio вертикальных шаблонов

**Проблема.** При переключении на вид списка вертикальные превью становятся горизонтальными.

**Причина (код).** В `footage-grid.tsx` для compact/list явно форсится `16 / 9`:

```ts
aspectRatio: compact ? "16 / 9" : aspectRatio,
```

**Цель.** В list view сохранять исходный aspect (VERTICAL → 9:16 и т.д.), либо показывать letterbox/pillarbox без искажения ориентации.

**Где смотреть**
- `src/js/components/footage-grid.tsx` — `compact`, style `aspectRatio`
- `src/js/lib/utils/pack-types.ts` — `preview` aspect enum
- `src/js/main/main.tsx` — переключение toolbar/media (`viewMode`)

**Шаги**
1. Убрать форс `16/9` в compact **или** заменить на сохранение `resolvePreviewAspectRatio` с ограничением высоты строки.
2. Подправить layout list-row (фиксированная высота + object-fit), чтобы вертикальные карточки не раздували строку.
3. Проверить DEFAULT / VERTICAL / BOX на media и toolbar view.

**Критерий готовности.** Вертикальный шаблон в list остаётся вертикальным (не «ложится» в 16:9).

---

## 4. Неясные иконки футера: размер vs focus mode

**Проблема.** Иконка «стрелки влево-вниз / вправо-вверх» (`Maximize2`) скрывает панель категорий — коллега ожидал изменение размера превью. Рядом «рамочка» (`Scan`) «вообще ничего не нажимает».

**Факт по коду** (`panel-footer.tsx`)
| Иконка | Сейчас | Ожидание коллеги |
|--------|--------|------------------|
| `Scan` | Reset thumb size → default | Увеличить / изменить размер |
| `Maximize2` | Toggle focus mode (скрыть sidebar) | Изменить размер превью |
| Range slider | Реальный контроль размера | Не замечен / неочевиден |

**Цель.** Сделать поведение очевидным: подписи/tooltip, понятные иконки, видимая обратная связь.

**Шаги**
1. Добавить `title` / tooltip: «Reset thumbnail size», «Hide categories (focus mode)».
2. Для `Scan`: если размер уже default — визуальный feedback (краткая вспышка / status), либо убрать кнопку и оставить только slider + «− / +».
3. Рассмотреть переименование/замену иконок (`PanelLeftClose` для focus, `ZoomIn`/`Maximize` для size).
4. Не смешивать focus mode и thumbnail size в одной визуальной группе без разделителя.

**Критерий готовности.** Новый пользователь понимает, что делает каждая кнопка; `Scan` даёт заметный эффект или убран.

---

## 5. Размер превью не работает в list view

**Проблема.** «Если на лист переключиться — не работает; в гриде — ок.»

**Цель.** Либо slider/Scan влияют на list (высота строки / масштаб), либо в list view контролы disabled с пояснением.

**Где смотреть**
- `src/js/lib/panel-ui-context.tsx` — `thumbSize` → `gridColumns` (только колонки грида)
- `src/js/components/footage-grid.tsx` — list/compact layout
- `src/js/components/panel-footer.tsx` — контролы всегда активны

**Шаги**
1. Подтвердить, что `thumbSize` влияет только на `gridColumns` и игнорируется в list.
2. Решение A: в list менять высоту/scale строк от `thumbSize`.
3. Решение B: в list дизейблить slider + Scan и показать tooltip «Available in grid view».
4. Согласовать с п.4 (UX иконок).

**Критерий готовности.** В list поведение контролов предсказуемо (работают или явно отключены).

---

## Порядок работ

```
P0  #2  Sticky/overlapping hover previews     (баг воспроизведения)
P0  #3  Vertical aspect in list view          (явный баг в коде)
P1  #1  Open pack from Market                 (UX shortcut)
P1  #4  Footer icon clarity                   (UX)
P2  #5  Thumb size in list view               (зависит от #4)
```

## Оценка

| Задача | Оценка |
|--------|--------|
| #2 Hover preview | 0.5–1 д |
| #3 Aspect list | 0.25–0.5 д |
| #1 Open from Market | 0.5 д |
| #4 + #5 Footer UX | 0.5 д |
| **Итого** | **~2–2.5 д** |

## Тест-план (ручной)

- [ ] Wedding pack, transitions: быстрый hover по 10+ карточкам — тишина/стоп после leave
- [ ] Global Play Preview on/off — без регрессий
- [ ] VERTICAL item: grid vs list — ориентация сохраняется
- [ ] Market → Installed → Open → пак активен без захода в Settings
- [ ] Focus mode: sidebar скрывается/возвращается, tooltip понятен
- [ ] Thumb size slider в grid меняет колонки; в list — по выбранному решению A/B
- [ ] Scan reset: с non-default размера возвращает default + заметный feedback

## Связанные файлы

- `src/js/components/footage-grid.tsx`
- `src/js/components/panel-footer.tsx`
- `src/js/components/market-panel.tsx`
- `src/js/components/settings-panel.tsx`
- `src/js/lib/panel-ui-context.tsx`
- `src/js/main/main.tsx`
- `src/js/components/PresetGrid.tsx` (проверка hover)
