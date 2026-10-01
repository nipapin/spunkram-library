# Команды CEP

В `package.json` остаются три основные команды и проверка изоляции брендов:

```sh
npm run dev        # выбор автора → dev-сервер
npm run build      # выбор автора → сборка панели
npm run release    # patch / minor / major → выбор автора → релиз
npm run assert:brands
```

Меню: стрелки вверх/вниз или цифра, Enter для выбора, Esc/Ctrl+C для отмены. Авторы: Spunkram, Premiere Gal и Premiere Basics (Odin Pro).

Параметры заменяют соответствующие вопросы. Для CI и терминалов без TTY их нужно указывать явно:

```sh
npm run dev -- --author=odin
npm run build -- --author=gal
npm run build -- --author=odin --format=zxp
npm run build -- --author=spunkram --format=zip
npm run release -- --type=patch --author=spunkram
npm run release -- --type=minor --author=gal --dry-run
npm run release -- --author=all --type=patch
npm run release -- --author=gal --beta
```

`build` по умолчанию собирает панель. `--format=zxp` подписывает пакет; `--format=zip` использует существующий ZIP-процесс Vite CEP. Зависимости собираются перед dev/build; `SKIP_DEPS_BUILD=1` сохраняет прежнюю возможность пропустить этот этап.

Релиз повышает версию выбранного бренда, собирает ZXP, коммитит текущие изменения, выполняет push/tag и загрузку в R2 по существующему сценарию. `--dry-run` показывает шаги без сборки, изменения версии, копирования артефактов, Git-записей и upload. Дополнительные параметры: `--no-git`, `--no-upload`, `--skip-build`, `--message="..."`. Старые флаги `--brand` и `--bump` остаются алиасами `--author` и `--type`.

Публикация настроена для Spunkram и Gal (`--author=all` означает оба этих бренда). Для Odin доступна сборка ZXP и релиз без загрузки:

```sh
npm run release -- --type=patch --author=odin --no-upload
```

Для обычной публикации нужны `next-app/.env`, R2 и загрузчик `scripts/upload-spunkram-zxp.mjs`. `NEXT_APP_ROOT` позволяет указать другой путь к `next-app`. Odin пока не поддерживается этим загрузчиком.

Редкие служебные действия доступны напрямую, без дополнительных npm scripts:

```sh
node scripts/cli.mjs watch --author=spunkram
node scripts/cli.mjs serve --author=odin
node scripts/cli.mjs symlink --author=gal
node scripts/cli.mjs delsymlink --author=gal
node scripts/build-deps.mjs
node scripts/cli.mjs --help
node --test scripts/test-cli.mjs
```

`node scripts/cli.mjs zxp|zip --author=…` также поддерживается как сокращение соответствующего формата сборки. Прежние npm scripts с именами авторов удалены; GitHub Actions использует явный `--author`.
