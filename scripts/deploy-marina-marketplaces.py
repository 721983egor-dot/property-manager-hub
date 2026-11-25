#!/usr/bin/env python3
"""Build and activate the Marina marketplace listing update."""
import argparse
import copy
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.request
from urllib.parse import unquote, urlsplit

ROOT = Path("/opt/rm-os-recovery")
BASE = ROOT / "beget-production-20261115"
PRODUCTION = BASE / "production.yml"
WORK = ROOT / "ai-employees-20261125"
SOURCE = WORK / "marina-learning"
CANDIDATE = WORK / "marina-marketplaces"
OVERLAY = WORK / "marina-marketplaces-overlay.json"
BACKUP = BASE / "production.before-marina-marketplaces.yml"
PENDING = BASE / "production.marina-marketplaces-candidate.yml"
OLD = "rmos-beget-prod-app:marina-learning-20261125"
NEW = "rmos-beget-prod-app:marina-marketplaces-20261125"
CONTAINER = "rmos-beget-prod-app-1"
HEALTH = "http://127.0.0.1:64197/api/public/health"
COMPOSE = ["docker", "compose", "-p", "rmos-beget-prod", "--env-file", str(BASE / "production.env")]
def output(cmd):
    return subprocess.check_output(cmd, text=True)

def config(*files):
    cmd = COMPOSE + [part for path in files for part in ("-f", str(path))]
    return json.loads(output(cmd + ["config", "--format", "json"]))

def live():
    return json.loads(output(["docker", "inspect", CONTAINER]))[0]

def replace_once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError("Unexpected source layout near " + old.splitlines()[0][:75])
    return text.replace(old, new, 1)

def build(revision):
    if not re.fullmatch("[a-f0-9]{40}", revision) or live()["Config"]["Image"] != OLD:
        raise RuntimeError("The deployed image or release revision is different.")
    original = config(PRODUCTION)["services"]["app"]
    if original["build"]["context"] != str(SOURCE) or original["image"] != OLD:
        raise RuntimeError("The deployed build source changed.")
    raw = f"https://raw.githubusercontent.com/721983egor-dot/property-manager-hub/{revision}/"
    def fetch(path):
        with urllib.request.urlopen(raw + path, timeout=25) as response:
            return response.read(300_000).decode()
    shutil.copytree(SOURCE, CANDIDATE,
                    ignore=shutil.ignore_patterns(".git", ".env*", "node_modules", ".output", "dist"))
    for path in [
        "src/lib/ai-manager/model.ts",
        "src/lib/ai-manager/service.server.ts",
        "src/lib/ai-manager/marina-instructions.ts",
    ]:
        (CANDIDATE / path).write_text(fetch(path))

    OVERLAY.write_text(json.dumps({"services": {"app": {
        "image": NEW, "build": {"context": str(CANDIDATE)},
        "environment": {"MESSENGER_MARINA_TEST_ENABLED": "false"},
    }}}))
    cmd = COMPOSE + ["-f", str(PRODUCTION), "-f", str(OVERLAY), "build", "app"]
    print("Building the scoped marketplace candidate.", flush=True)
    with (WORK / "marina-marketplaces-build.log").open("wb") as log:
        subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, check=True)
    print("Candidate built. Production is still on the prior version.", flush=True)

def health(image):
    for _ in range(24):
        try:
            container = live()
            env = dict(entry.split("=", 1) for entry in container["Config"]["Env"])
            if container["Config"]["Image"] == image and container["State"]["Running"]:
                if image == NEW and env.get("MESSENGER_MARINA_TEST_ENABLED") != "false":
                    return False
                with urllib.request.urlopen(HEALTH, timeout=3) as response:
                    if response.status == 200:
                        return True
        except (OSError, subprocess.CalledProcessError):
            pass
        time.sleep(2)
    return False

def activate():
    if BACKUP.exists() or PENDING.exists():
        raise RuntimeError("The previous activation attempt needs review.")
    before = config(PRODUCTION)
    previous_app = before["services"]["app"]
    active = live()["Config"]
    live_env = dict(entry.split("=", 1) for entry in active["Env"])
    if active["Image"] != OLD or previous_app["image"] != OLD:
        raise RuntimeError("The running release has changed.")
    if any(live_env.get(key) != value for key, value in previous_app["environment"].items()):
        raise RuntimeError("The running application settings differ from Compose.")
    subprocess.run(["docker", "image", "inspect", NEW], stdout=subprocess.DEVNULL, check=True)

    text = PRODUCTION.read_text()
    match = re.search(r"(?ms)^  app:\s*\n.*?(?=^  \w[\w-]*:\s*\n|\Z)", text)
    if not match:
        raise RuntimeError("Cannot identify the app service in the working configuration.")
    app = replace_once(match[0], f"    image: {OLD}\n", f"    image: {NEW}\n")
    app = replace_once(app, f"      context: {SOURCE}\n", f"      context: {CANDIDATE}\n")
    if re.search(r"(?m)^ +MESSENGER_MARINA_TEST_ENABLED:", app):
        app = re.sub(r"(?m)^( +MESSENGER_MARINA_TEST_ENABLED:).*?$", r'\1 "false"', app)
    else:
        app = replace_once(app, "    environment:\n",
                           '    environment:\n      MESSENGER_MARINA_TEST_ENABLED: "false"\n')
    PENDING.write_text(text[:match.start()] + app + text[match.end():])
    os.chmod(PENDING, PRODUCTION.stat().st_mode & 0o777)
    expected = copy.deepcopy(before)
    expected_app = expected["services"]["app"]
    expected_app["image"] = NEW
    expected_app["build"]["context"] = str(CANDIDATE)
    expected_app["environment"]["MESSENGER_MARINA_TEST_ENABLED"] = "false"
    if config(PENDING) != expected:
        raise RuntimeError("Unexpected differences in the staged application settings.")

    shutil.copy2(PRODUCTION, BACKUP)
    os.replace(PENDING, PRODUCTION)
    command = COMPOSE + ["-f", str(PRODUCTION), "up", "-d", "--no-deps", "--no-build", "app"]
    with (WORK / "marina-marketplaces-activate.log").open("ab") as log:
        try:
            subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
            if not health(NEW):
                raise RuntimeError("The new application did not pass its health check.")
        except BaseException:
            shutil.copy2(BACKUP, PENDING)
            os.replace(PENDING, PRODUCTION)
            subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
            if not health(OLD):
                raise RuntimeError("Rollback attempted; prior application health could not be confirmed.")
            raise RuntimeError("Health check failed. Previous application restored.") from None
    print("Marina marketplace listings are live. HTTP 200. Telegram auto-reply callback disabled.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("revision")
    args = parser.parse_args()
    try:
        build(args.revision)
        activate()
    except RuntimeError as error:
        raise SystemExit(str(error))
