# RM OS — тонкая iOS-оболочка (Capacitor)

Личная установка через sideload, **не** App Store.

Приложение — WKWebView, который открывает уже работающий RM OS по URL:

| `RM_OS_TARGET` | URL |
|----------------|-----|
| `prod` (по умолчанию) | https://rm-os.residence-more.ru |
| `preview` | https://preview-rm-os.residence-more.ru |

Веб-приложение **не** переписывается в native.

## Важно

- **Неподписанный .ipa на обычный iPhone не ставится.** iOS требует подпись (хотя бы бесплатным Apple ID).
- Сборка `.ipa` возможна **только на Mac с Xcode** (или облачный Mac). В Linux CI бинарник не собрать.
- В этом репозитории — scaffold проекта + команды. Готового `.ipa` в git нет.

Полная инструкция для Егора (AltStore / Sideloadly, 7 дней, платный Developer): см. внешний док `rm-os-iphone-ipa-sideload.md`.

## Быстрый старт (Mac)

```bash
cd mobile
npm ci
RM_OS_TARGET=prod npm run sync    # или preview
npm run open:ios                  # открыть Xcode
```

В Xcode:

1. Выберите Team = ваш Apple ID (Signing & Capabilities → Automatically manage signing).
2. Подключите iPhone → Run, **или**
3. Соберите IPA: `./scripts/build-ipa.sh` и поставьте через Sideloadly / AltStore.

Переключить URL после смены target:

```bash
RM_OS_TARGET=preview npm run sync
```

## Структура

- `capacitor.config.js` — `server.url` на hosted RM OS
- `www/` — заглушка на случай офлайна конфига (в runtime грузится remote URL)
- `ios/` — Xcode-проект Capacitor 8 (SPM)
- `resources/` — исходник иконки
- `scripts/build-ipa.sh` — archive + export (только macOS)

## Не делаем

- Выкладку в App Store
- Force push / правки `main` без команды
- Прод-деплой веб-RM OS из этой задачи
