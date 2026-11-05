Закрытая тестовая РМ ОС на независимом VPS

Адрес: https://preview-rm-os.residence-more.ru
VPS: VDSina, 178.20.46.187 (Москва). Другие приложения на VPS не перезапускать.
Код: /opt/rm-os-preview/repo
Docker Compose project: rmos-preview
Локальные порты VPS: приложение 127.0.0.1:64194, API 127.0.0.1:54321.
Внешний вход: nginx, действующий HTTPS, пароль браузера, затем вход РМ ОС.
Пароль браузера и тестового администратора одинаковый; логин admin@rm-os.test.
Сам пароль не хранится в Git. Настройки: deploy/reserve-preview/.env.preview (0600).

Конфигурация:
docker compose --project-name rmos-preview --env-file deploy/reserve-preview/.env.preview \
  -f deploy/local/compose.yml -f deploy/reserve-preview/compose.yml ...
Второй файл накладывается на первый. База и хранилище — отдельные постоянные volumes.
Публичные страницы закрыты паролем браузера. API использует штатные JWT/RLS:
финансы требуют входа администратора, а анонимные свойства остаются демонстрационными.
Открытая регистрация выключена. Нельзя загружать в эту базу реальные данные Beget.

Команды на VPS, из /opt/rm-os-preview/repo:
python3 scripts/reserve-preview.py status
python3 scripts/reserve-preview.py logs app
python3 scripts/reserve-preview.py setup    — создание базы и демо только при первом запуске
python3 scripts/reserve-preview.py update   — SQL-копия текущей тестовой базы, миграции, сборка приложения
python3 scripts/reserve-preview.py build    — только сборка и запуск приложения

Для следующего обновления загрузить новую версию кода, сохранив .env.preview,
и выполнить update. Не удалять volumes, не выполнять down -v, не повторять
начальную загрузку SQL поверх внесённых тестовых изменений.
Копии перед обновлениями лежат в /opt/rm-os-preview/backups: они находятся
на том же VPS и не заменяют независимое внешнее резервное хранилище.

На VPS нет рабочих ключей площадок, Telegram/почтовых рассылок и cron-задач РМ ОС.
Включён флаг сборки VITE_TEST_ENVIRONMENT=true: тестовая плашка и отключение Метрики.
Основные домены residence-more.ru, www и rm-os продолжают показывать status-page.
Обновление закрытого теста не является публикацией в рабочую РМ ОС.

После получения данных Beget:
восстановить их в другой проект базы и хранилища, проверить целостность/дату,
сохранить исходные ключи расшифровки договоров. Демонстрационные records не переносить.
Новые изменения схемы применять к копии восстановленной базы и отдельно проверять.

Сертификат:
/etc/letsencrypt/live/preview-rm-os.residence-more.ru/
Первый выпуск DNS-01, затем обновление через webroot HTTP-01:
/var/www/rm-status/dist. Проверка:
certbot renew --cert-name preview-rm-os.residence-more.ru --dry-run --no-random-sleep-on-renew
После продления общий deploy-hook проверяет nginx и перечитывает сертификаты.
