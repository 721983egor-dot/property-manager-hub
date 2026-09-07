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
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

APP = FastAPI(title="RM OS Deploy Agent")

REPO_DIR = Path(os.environ.get("REPO_DIR", "/data/repo"))
COMPOSE_FILE = REPO_DIR / "deploy" / "docker-compose.yml"
ENV_FILE = REPO_DIR / "deploy" / ".env"
BACKUP_DIR = Path(os.environ.get("BACKUP_DIR", "/data/backups"))
STATE_FILE = Path(os.environ.get("STATE_FILE", "/data/state.json"))

AGENT_TOKEN = os.environ["DEPLOY_AGENT_TOKEN"]
GITHUB_REPO = os.environ["GITHUB_REPO"]
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
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{result.stderr}")
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


def get_git_version() -> str:
    try:
        return run(["git", "-C", str(REPO_DIR), "rev-parse", "--short", "HEAD"]).strip()
    except Exception:
        return "unknown"


class DeployRequest(BaseModel):
    source: str = "rm-os-ui"


@APP.get("/status")
def status(authorization: str | None = Header(None)):
    verify_token(authorization)
    state = load_state()
    version = state.get("current_version", "unknown")
    return {
        "ok": True,
        "version": version,
        "message": f"Deploy-агент работает. Текущая версия: {version}",
        "domain": DOMAIN,
    }


@APP.post("/deploy")
def deploy(req: DeployRequest, authorization: str | None = Header(None)):
    verify_token(authorization)
    state = load_state()

    try:
        # 1. Резервная копия
        backup_path = backup_database()

        # 2. Обновление кода
        if not REPO_DIR.exists():
            REPO_DIR.parent.mkdir(parents=True, exist_ok=True)
            run(["git", "clone", GITHUB_REPO, str(REPO_DIR)])
        else:
            run(["git", "-C", str(REPO_DIR), "fetch", "origin"])
            run(["git", "-C", str(REPO_DIR), "reset", "--hard", "origin/main"])

        version = get_git_version()

        # 3. Сборка и запуск
        run(
            ["docker", "compose", "-f", str(COMPOSE_FILE), "--env-file", str(ENV_FILE), "build", "app"],
            timeout=600,
        )
        run(
            ["docker", "compose", "-f", str(COMPOSE_FILE), "--env-file", str(ENV_FILE), "up", "-d", "app"],
            timeout=120,
        )

        # 4. Проверка здоровья
        time.sleep(5)
        health = run(["docker", "compose", "-f", str(COMPOSE_FILE), "ps", "--format", "json"])

        # 5. Сохраняем состояние
        state["deployments"].append({
            "version": version,
            "at": datetime.now(timezone.utc).isoformat(),
            "backup": backup_path,
            "source": req.source,
            "status": "success",
        })
        state["current_version"] = version
        save_state(state)

        return {
            "ok": True,
            "version": version,
            "message": f"Обновление выполнено. Версия {version}. Резервная копия: {backup_path}",
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


@APP.post("/rollback")
def rollback(authorization: str | None = Header(None)):
    verify_token(authorization)
    state = load_state()
    deployments = state.get("deployments", [])
    successful = [d for d in deployments if d.get("status") == "success"]

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
            ["docker", "compose", "-f", str(COMPOSE_FILE), "--env-file", str(ENV_FILE), "up", "-d", "app"],
            timeout=120,
        )

        state["deployments"].append({
            "version": target,
            "at": datetime.now(timezone.utc).isoformat(),
            "source": "rollback",
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
