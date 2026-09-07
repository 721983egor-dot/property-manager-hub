# Self-hosting RM OS на российском сервере

Эта папка содержит всё необходимое, чтобы запустить RM OS на своём сервере в России.

## Что входит

- `docker-compose.yml` — полный стек: приложение, PostgreSQL, Supabase Auth/REST, MinIO (фото), Caddy (SSL), deploy-агент.
- `Dockerfile` — сборка приложения RM OS.
- `Dockerfile.agent` + `deploy-agent.py` — агент обновлений «по кнопке».
- `Caddyfile` — reverse proxy с автоматическим SSL.
- `.env.example` — шаблон переменных окружения.
- `setup.sh` — базовая настройка чистого VPS.

## Минимальные требования к серверу

- VPS в России (Timeweb / Selectel / Yandex Cloud)
- 4 CPU / 8 ГБ RAM / 80 ГБ SSD
- Ubuntu 22.04/24.04 LTS
- Доступ root по SSH

## Пошаговая установка

### 1. Подготовка в Lovable

1. Подключите GitHub к проекту: меню `+` → GitHub → Connect project.
2. Скопируйте URL репозитория.

### 2. Настройка сервера

Зайдите на сервер по SSH и выполните:

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/deploy/setup.sh | bash
```

Или вручную:

```bash
apt-get update
apt-get install -y docker.io docker-compose-plugin git curl ufw fail2ban
systemctl enable docker
systemctl start docker
```

### 3. Клонирование репозитория

```bash
mkdir -p /opt/rm-os
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git /opt/rm-os/repo
```

### 4. Переменные окружения

```bash
cd /opt/rm-os/repo/deploy
cp .env.example .env
nano .env
```

Заполните обязательные поля:
- `DOMAIN` — ваш домен, например `residence-more.ru`
- `POSTGRES_PASSWORD` — сложный пароль
- `JWT_SECRET` — минимум 32 символа
- `DEPLOY_AGENT_TOKEN` — случайный токен для вызова обновлений
- `GITHUB_REPO` — URL вашего репозитория
- API-ключи площадок (`CIAN_API_KEY`, `YANDEX_*`)

### 5. Первый запуск

```bash
docker compose up -d
```

Caddy автоматически выпустит SSL-сертификат.

### 6. Перенос данных

Сделайте бэкап текущей базы из Lovable Cloud и восстановите на сервере:

```bash
# Экспорт из Lovable Cloud (выполняется через Lovable UI или pg_dump)
pg_dump -d "postgresql://..." -f rm-os-export.sql

# Импорт на сервер
docker cp rm-os-export.sql rm-os-supabase-db-1:/tmp/
docker exec rm-os-supabase-db-1 psql -U postgres -d postgres -f /tmp/rm-os-export.sql
```

### 7. Перенос фото

```bash
# Скачать фото из текущего хранилища и загрузить в MinIO
# (инструкция генерируется после предоставления доступов к бакету)
```

### 8. Настройка DNS

В панели управления доменом создайте записи:

- Тип A, имя `@`, значение `<IP вашего сервера>`
- Тип A, имя `www`, значение `<IP вашего сервера>`

Если хотите RM OS на поддомене:
- Тип A, имя `admin`, значение `<IP вашего сервера>`

### 9. Обновление по кнопке

После запуска в RM OS появится раздел «Обновление системы».
- `DEPLOY_AGENT_URL` в приложении = `http://deploy-agent:8080`
- `DEPLOY_AGENT_TOKEN` = тот же токен, что в `.env`

Нажатие «Обновить систему»:
1. Делает резервную копию базы
2. Забирает свежий код из GitHub
3. Пересобирает приложение
4. Перезапускает контейнеры

## Откат

Кнопка «Вернуть предыдущую версию» восстанавливает базу из последнего бэкапа и откатывает код.

## Резервные копии

Deploy-агент автоматически создаёт бэкап PostgreSQL перед каждым обновлением.
Для копирования во внешнее S3-хранилище заполните `BACKUP_*` переменные.

## Поддержка

Для первичной настройки передайте разработчику:
- IP-адрес сервера
- root-пароль или SSH-ключ
- домен
- доступ к DNS домена
- API-ключи площадок (если нужно перенести)
