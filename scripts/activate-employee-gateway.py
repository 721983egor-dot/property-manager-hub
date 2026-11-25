#!/usr/bin/env python3
"""Activate the verified gateway build and roll back if the application fails."""
import copy
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.request

BASE = Path("/opt/rm-os-recovery/beget-production-20261115")
STAGING = Path("/opt/rm-os-recovery/ai-employees-20261125")
PRODUCTION = BASE / "production.yml"
PENDING = BASE / "production.polza-candidate.yml"
BACKUP = BASE / "production.before-polza-20261125.yml"
OVERLAY = STAGING / "polza-employee-overlay.json"
HISTORY = STAGING / "polza-activate.log"
OLD_IMAGE = "rmos-beget-prod-app:selection-public-20261120"
NEW_IMAGE = "rmos-beget-prod-app:employee-polza-20261125"
CONTAINER = "rmos-beget-prod-app-1"
HEALTH = "http://127.0.0.1:64197/api/public/health"
COMPOSE = ["docker", "compose", "-p", "rmos-beget-prod", "--env-file", str(BASE / "production.env")]

def rendered(path):
    return json.loads(subprocess.check_output(COMPOSE + ["-f", str(path), "config", "--format", "json"]))

def active():
    return json.loads(subprocess.check_output(["docker", "inspect", CONTAINER]))[0]

def healthy(image):
    for _ in range(25):
        try:
            container = active()
            if container["Config"]["Image"] == image and container["State"]["Running"]:
                with urllib.request.urlopen(HEALTH, timeout=3) as response:
                    if response.status == 200:
                        return True
        except (OSError, subprocess.CalledProcessError):
            pass
        time.sleep(2)
    return False

def replace_one(contents, old, new):
    if contents.count(old) != 1:
        raise RuntimeError("Expected app setting was not found uniquely.")
    return contents.replace(old, new, 1)

def install():
    if PENDING.exists() or BACKUP.exists():
        raise RuntimeError("A previous activation attempt needs review.")
    overlay = json.loads(OVERLAY.read_text())["services"]["app"]
    if overlay["image"] != NEW_IMAGE:
        raise RuntimeError("The verified candidate tag has changed.")
    before = rendered(PRODUCTION)
    original_app = before["services"]["app"]
    live = active()
    if live["Config"]["Image"] != OLD_IMAGE or original_app["image"] != OLD_IMAGE:
        raise RuntimeError("The working release has changed since verification.")
    existing_env = dict(value.split("=", 1) for value in live["Config"]["Env"])
    if any(existing_env.get(key) != value for key, value in original_app["environment"].items()):
        raise RuntimeError("The live application environment differs from the saved configuration.")
    subprocess.run(["docker", "image", "inspect", NEW_IMAGE], stdout=subprocess.DEVNULL, check=True)

    contents = PRODUCTION.read_text()
    old_context = original_app["build"]["context"]
    new_context = overlay["build"]["context"]
    env_path = overlay["env_file"][0]
    if not Path(env_path).is_file() or Path(env_path).stat().st_mode & 0o077:
        raise RuntimeError("The private gateway file is missing or its permissions changed.")
    app_match = re.search(r"(?ms)^  app:\s*\n.*?(?=^  \w[\w-]*:\s*\n|\Z)", contents)
    if not app_match:
        raise RuntimeError("The deployment file does not have a recognizable app service.")
    app_text = replace_one(app_match[0], f"    image: {OLD_IMAGE}\n",
                           f"    image: {NEW_IMAGE}\n    env_file:\n      - {env_path}\n")
    app_text = replace_one(app_text, f"      context: {old_context}\n", f"      context: {new_context}\n")
    new_contents = contents[:app_match.start()] + app_text + contents[app_match.end():]
    with PENDING.open("x") as file:
        file.write(new_contents)
    os.chmod(PENDING, PRODUCTION.stat().st_mode & 0o777)

    after = rendered(PENDING)
    updated = after["services"]["app"]
    expected = copy.deepcopy(before)
    expected["services"]["app"]["image"] = NEW_IMAGE
    expected["services"]["app"]["build"]["context"] = new_context
    expected["services"]["app"]["env_file"] = updated.get("env_file")
    new_env = dict(line.split("=", 1) for line in Path(env_path).read_text().splitlines())
    if set(new_env) != {"AI_EMPLOYEES_PROVIDER", "AI_EMPLOYEES_GATEWAY_URL",
                        "AI_EMPLOYEES_GATEWAY_KEY", "AI_EMPLOYEES_OPENAI_MODEL"}:
        raise RuntimeError("Unexpected settings in the gateway file.")
    if any(key in original_app["environment"] for key in new_env):
        raise RuntimeError("Gateway settings already exist on the active service.")
    expected["services"]["app"]["environment"].update(new_env)
    if expected != after:
        raise RuntimeError("The deployment would change unrelated Compose settings.")

    shutil.copy2(PRODUCTION, BACKUP)
    os.replace(PENDING, PRODUCTION)
    with HISTORY.open("ab") as log:
        command = COMPOSE + ["-f", str(PRODUCTION), "up", "-d", "--no-deps", "--no-build", "app"]
        try:
            subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
            if not healthy(NEW_IMAGE):
                raise RuntimeError("The new application did not pass its health check.")
        except BaseException:
            shutil.copy2(BACKUP, PENDING)
            os.replace(PENDING, PRODUCTION)
            subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
            if not healthy(OLD_IMAGE):
                raise RuntimeError("Rollback was attempted but the prior app did not pass health.")
            raise RuntimeError("The gateway release failed its check. Previous release restored.") from None
    print("Marina gateway release active. Application health returned HTTP 200.")

if __name__ == "__main__":
    try:
        install()
    except RuntimeError as error:
        raise SystemExit(str(error))
