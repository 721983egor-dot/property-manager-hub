#!/usr/bin/env python3
"""Deploy-агент RM OS.

Получает HTTPS-запросы от приложения RM OS и управляет:
- git pull из GitHub
- сборкой Docker-образа
- применением миграций базы данных
- переключением контейнеров
- резервным копированием
- откатом на предыдущую версию
"""

import hashlib
import hmac
import json
import os
import base64
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
import uvicorn
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

APP = FastAPI(title="RM OS Deploy Agent")

REPO_DIR = Path(os.environ.get("REPO_DIR", "/data/repo"))
PREVIEW_DIR = Path(os.environ.get("PREVIEW_DIR", "/opt/rm-os/preview"))
PREVIEW_BRANCH = os.environ.get("PREVIEW_BRANCH", "preview")
COMPOSE_FILE = REPO_DIR / "deploy" / "docker-compose.yml"
ENV_FILE = REPO_DIR / "deploy" / ".env"
BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", "/data/backups"))
STATE_FILE = Path(os.environ.get("STATE_FILE", "/data/state.json"))

AGENT_TOKEN = os.environ["DEPLOY_AGENT_TOKEN"]
GITHUB_REPO = os.environ["GITHUB_REPO"]
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
DOMAIN = os.environ.get("DOMAIN", "localhost")
APP_IMAGE = os.environ.get("APP_IMAGE", "rm-os-app")


def verify_token(authorization: str | None) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization[7:]
    if not hmac.compare_digest(token, AGENT_TOKEN):
        raise HTTPException(status_code=401, detail="Unauthorized")


def run(cmd: list[str], cwd: Path | None = None, timeout: int = 600) -> str:
    result = subprocess.run(
        cmd,
        cwd=cwd or REPO_DIR,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if result.returncode != 0:
        output = "\n".join(part.strip() for part in (result.stdout, result.stderr) if part.strip())
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{output or 'Команда завершилась без сообщения'}")
    return result.stdout


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"deployments": [], "current_version": "unknown"}


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False))


def backup_database() -> str:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    path = BACKUP_DIR / f"backup-{timestamp}.sql"
    db_url = f"postgres://postgres:{os.environ.get('POSTGRES_PASSWORD', 'postgres')}@supabase-db:5432/postgres"
    run(["pg_dump", "-d", db_url, "-f", str(path)], timeout=300)
    return str(path)


def get_git_version(repo_dir: Path | None = None) -> str:
    try:
        return run(["git", "-C", str(repo_dir or REPO_DIR), "rev-parse", "--short", "HEAD"]).strip()
    except Exception:
        return "unknown"


def remote_has_branch(repo_dir: Path, branch: str) -> bool:
    result = subprocess.run(
        ["git", "-C", str(repo_dir), "rev-parse", "--verify", f"origin/{branch}"],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def sync_git(repo_dir: Path, branch: str) -> str:
    """Приводит каталог к origin/<branch>. Рабочий сайт этот каталог не переключает сам."""
    repo_dir.parent.mkdir(parents=True, exist_ok=True)
    if not (repo_dir / ".git").exists():
        run(["git", "clone", GITHUB_REPO, str(repo_dir)])
    run(["git", "-C", str(repo_dir), "fetch", "origin", "--prune"])
    if not remote_has_branch(repo_dir, branch):
        raise RuntimeError(
            f"Ветка `{branch}` не найдена на GitHub. Сначала запушьте её: git push -u origin {branch}"
        )
    run(["git", "-C", str(repo_dir), "checkout", "-B", branch, f"origin/{branch}"])
    run(["git", "-C", str(repo_dir), "reset", "--hard", f"origin/{branch}"])
    return get_git_version(repo_dir)


def production_source_branch(repo_dir: Path) -> str:
    """На рабочий сервер уходит проверенная preview, если такая ветка уже есть."""
    run(["git", "-C", str(repo_dir), "fetch", "origin", "--prune"])
    if remote_has_branch(repo_dir, PREVIEW_BRANCH):
        return PREVIEW_BRANCH
    return "main"


def maybe_fast_forward_github_main() -> None:
    """Если есть токен GitHub — main на GitHub совпадёт с тем, что ушло на рабочий сервер."""
    if not GITHUB_TOKEN:
        return
    remote = GITHUB_REPO
    if remote.startswith("https://") and "@" not in remote:
        remote = remote.replace("https://", f"https://x-access-token:{GITHUB_TOKEN}@", 1)
    try:
        run(["git", "-C", str(REPO_DIR), "push", remote, "HEAD:main"])
    except Exception:
        # Рабочий деплой уже прошёл; рассинхрон GitHub не откатывает сайт.
        pass


def register_telegram_webhook() -> None:
    """После обновления закрепляет единственного бота за рабочим RM OS."""
    lovable_key = os.environ.get("LOVABLE_API_KEY", "")
    telegram_key = os.environ.get("TELEGRAM_API_KEY", "")
    if not lovable_key or not telegram_key:
        return
    digest = hashlib.sha256(f"telegram-webhook:{telegram_key}".encode()).digest()
    secret = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    response = requests.post(
        "https://connector-gateway.lovable.dev/telegram/setWebhook",
        headers={
            "Authorization": f"Bearer {lovable_key}",
            "X-Connection-Api-Key": telegram_key,
            "Content-Type": "application/json",
        },
        json={
            "url": f"https://rm-os.{DOMAIN}/api/public/telegram/webhook",
            "secret_token": secret,
            "allowed_updates": ["message", "edited_message", "callback_query"],
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    if not payload.get("ok"):
        raise RuntimeError(f"Telegram webhook registration failed: {payload.get('description', 'unknown error')}")


class DeployRequest(BaseModel):
    source: str = "rm-os-ui"
    telegram_api_key: str | None = None
    lovable_api_key: str | None = None
    openai_api_key: str | None = None
    cian_api_key: str | None = None
    yandex_realty_token: str | None = None


def update_env_values(values: dict[str, str | None]) -> None:
    """Сохраняет переданные сервером секреты без вывода их в журналы."""
    existing = ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []
    pending = {key: value for key, value in values.items() if value}
    if not pending:
        return
    output: list[str] = []
    for line in existing:
        key = line.split("=", 1)[0] if "=" in line and not line.lstrip().startswith("#") else ""
        if key in pending:
            output.append(f"{key}={pending.pop(key)}")
        else:
            output.append(line)
    for key, value in pending.items():
        output.append(f"{key}={value}")
    ENV_FILE.write_text("\n".join(output) + "\n")


def update_deploy_agent() -> None:
    """Пересобирает агент после ответа, чтобы следующий запуск использовал новый код."""
    time.sleep(2)
    try:
        subprocess.Popen(
            [
                "docker", "compose", "-f", str(COMPOSE_FILE), "--env-file", str(ENV_FILE),
                "up", "-d", "--build", "--no-deps", "deploy-agent",
            ],
            cwd=REPO_DIR,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception:
        pass


@APP.get("/status")
def status(authorization: str | None = Header(None)):
    verify_token(authorization)
    state = load_state()
    version = state.get("current_version", "unknown")
    preview_version = state.get("preview_version", "—")
    return {
        "ok": True,
        "version": version,
        "preview_version": preview_version,
        "message": f"Рабочая версия: {version}. Тест: {preview_version}",
        "domain": DOMAIN,
        "production_url": f"https://rm-os.{DOMAIN}",
        "preview_url": f"https://preview.{DOMAIN}",
        "preview_rm_os_url": f"https://preview-rm-os.{DOMAIN}",
        "deployments": state.get("deployments", [])[-12:],
    }


@APP.post("/deploy")
def deploy(req: DeployRequest, authorization: str | None = Header(None)):
    verify_token(authorization)
    state = load_state()

    try:
        update_env_values({
            "TELEGRAM_API_KEY": req.telegram_api_key,
            "LOVABLE_API_KEY": req.lovable_api_key,
            "OPENAI_API_KEY": req.openai_api_key,
            "CIAN_API_KEY": req.cian_api_key,
            "YANDEX_REALTY_TOKEN": req.yandex_realty_token,
        })

        # 1. Резервная копия
        backup_path = backup_database()

        # 2. На рабочий сервер ставим ту версию, которую уже смотрели на тесте (preview),
        # либо main — пока отдельной тестовой ветки ещё нет.
        if not REPO_DIR.exists():
            REPO_DIR.parent.mkdir(parents=True, exist_ok=True)
            run(["git", "clone", GITHUB_REPO, str(REPO_DIR)])
        source_branch = production_source_branch(REPO_DIR)
        version = sync_git(REPO_DIR, source_branch)
        maybe_fast_forward_github_main()

        # 3. Сначала применяем миграции отдельным одноразовым контейнером.
        # При ошибке текущая версия приложения остаётся запущенной.
        run(
            ["docker", "compose", "-f", str(COMPOSE_FILE), "--env-file", str(ENV_FILE), "run", "--rm", "migrator"],
            timeout=600,
        )

        # API базы кеширует структуру и права. После миграций обновляем этот кеш,
        # не останавливая текущую рабочую версию приложения.
        run(
            ["docker", "compose", "-f", str(COMPOSE_FILE), "--env-file", str(ENV_FILE), "restart", "supabase-rest"],
            timeout=120,
        )

        # 4. Только после успешных миграций собираем и переключаем приложение.
        run(
            ["docker", "compose", "-f", str(COMPOSE_FILE), "--env-file", str(ENV_FILE), "build", "app"],
            timeout=600,
        )
        run(
            ["docker", "compose", "-f", str(COMPOSE_FILE), "--env-file", str(ENV_FILE), "up", "-d", "--no-deps", "app"],
            timeout=120,
        )

        # Новые фоновые сервисы тоже должны создаваться при обновлении. Раньше
        # запускался только app, поэтому сборщик статистики не появлялся.
        run(
            ["docker", "compose", "-f", str(COMPOSE_FILE), "--env-file", str(ENV_FILE), "up", "-d", "stats-cron"],
            timeout=180,
        )

        try:
            run(
                [
                    "docker", "compose", "-f", str(COMPOSE_FILE), "--env-file", str(ENV_FILE),
                    "exec", "-T", "caddy", "caddy", "reload", "--config", "/etc/caddy/Caddyfile",
                ],
                timeout=60,
            )
        except Exception:
            pass

        # Один Telegram-бот может иметь только один адрес. После каждого
        # обновления возвращаем его на рабочий сервер и рабочую базу.
        register_telegram_webhook()

        # 5. Проверка здоровья
        time.sleep(5)
        health = run(["docker", "compose", "-f", str(COMPOSE_FILE), "ps", "--format", "json"])

        # 6. Сохраняем состояние
        state["deployments"].append({
            "version": version,
            "at": datetime.now(timezone.utc).isoformat(),
            "backup": backup_path,
            "source": req.source,
            "target": "production",
            "status": "success",
        })
        state["current_version"] = version
        save_state(state)

        threading.Thread(target=update_deploy_agent, daemon=True).start()

        return {
            "ok": True,
            "version": version,
            "preview_version": state.get("preview_version", "—"),
            "message": f"Рабочая система обновлена до {version}. Сайт: https://{DOMAIN}, RM OS: https://rm-os.{DOMAIN}",
        }
    except Exception as e:
        state["deployments"].append({
            "version": "unknown",
            "at": datetime.now(timezone.utc).isoformat(),
            "source": req.source,
            "status": "failed",
            "error": str(e),
        })
        save_state(state)
        raise HTTPException(status_code=500, detail=str(e))


@APP.post("/deploy-preview")
def deploy_preview(req: DeployRequest, authorization: str | None = Header(None)):
    """Собирает тестовую копию. Рабочий контейнер app и миграции не трогает."""
    verify_token(authorization)
    state = load_state()

    try:
        version = sync_git(PREVIEW_DIR, PREVIEW_BRANCH)

        run(
            [
                "docker", "compose", "-f", str(COMPOSE_FILE), "--env-file", str(ENV_FILE),
                "--profile", "preview",
                "build", "preview-app",
            ],
            timeout=600,
        )
        run(
            [
                "docker", "compose", "-f", str(COMPOSE_FILE), "--env-file", str(ENV_FILE),
                "--profile", "preview",
                "up", "-d", "--no-deps", "preview-app",
            ],
            timeout=120,
        )

        try:
            run(
                [
                    "docker", "compose", "-f", str(COMPOSE_FILE), "--env-file", str(ENV_FILE),
                    "exec", "-T", "caddy", "caddy", "reload", "--config", "/etc/caddy/Caddyfile",
                ],
                timeout=60,
            )
        except Exception:
            pass

        state["deployments"].append({
            "version": version,
            "at": datetime.now(timezone.utc).isoformat(),
            "source": req.source,
            "target": "preview",
            "status": "success",
        })
        state["preview_version"] = version
        save_state(state)

        return {
            "ok": True,
            "version": version,
            "preview_version": version,
            "message": (
                f"Тестовая версия {version} на https://preview.{DOMAIN} "
                f"и https://preview-rm-os.{DOMAIN}. Рабочий сайт не изменён."
            ),
        }
    except Exception as e:
        state["deployments"].append({
            "version": "unknown",
            "at": datetime.now(timezone.utc).isoformat(),
            "source": req.source,
            "target": "preview",
            "status": "failed",
            "error": str(e),
        })
        save_state(state)
        raise HTTPException(status_code=500, detail=str(e))


@APP.post("/rollback")
def rollback(authorization: str | None = Header(None)):
    verify_token(authorization)
    state = load_state()
    deployments = state.get("deployments", [])
    successful = [
        d for d in deployments
        if d.get("status") == "success" and d.get("target") != "preview" and d.get("backup")
    ]

    if len(successful) < 2:
        raise HTTPException(status_code=400, detail="Нет предыдущей версии для отката")

    previous = successful[-2]
    backup_path = previous.get("backup")

    if not backup_path or not Path(backup_path).exists():
        raise HTTPException(status_code=400, detail="Резервная копия предыдущей версии не найдена")

    try:
        # Восстановление базы из бэкапа
        db_url = f"postgres://postgres:{os.environ.get('POSTGRES_PASSWORD', 'postgres')}@supabase-db:5432/postgres"
        run(["psql", "-d", db_url, "-f", backup_path], timeout=300)

        # Откат кода через git
        target = previous.get("version", "HEAD~1")
        run(["git", "-C", str(REPO_DIR), "reset", "--hard", target])

        run(
            ["docker", "compose", "-f", str(COMPOSE_FILE), "--env-file", str(ENV_FILE), "build", "app"],
            timeout=600,
        )
        run(
            ["docker", "compose", "-f", str(COMPOSE_FILE), "--env-file", str(ENV_FILE), "up", "-d", "--no-deps", "app"],
            timeout=120,
        )

        state["deployments"].append({
            "version": target,
            "at": datetime.now(timezone.utc).isoformat(),
            "source": "rollback",
            "target": "production",
            "status": "success",
        })
        state["current_version"] = target
        save_state(state)

        return {
            "ok": True,
            "version": target,
            "message": f"Откат выполнён к версии {target}",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@APP.exception_handler(Exception)
def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"ok": False, "message": str(exc)},
    )


if __name__ == "__main__":
    uvicorn.run(APP, host="0.0.0.0", port=8080)
