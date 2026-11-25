#!/usr/bin/env python3
"""Build the management report from the running release and replace only the app service."""
import copy
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.request

root = Path("/opt/rm-os-recovery")
base = root / "beget-production-20261115"
production = base / "production.yml"
source = root / "ai-employees-20261125" / "private-employee-test"
work = root / "finance-management-20261125"
candidate = work / "source"
pending = base / "production.finance-management-candidate.yml"
backup = work / "production.before.yml"
old = "rmos-beget-prod-app:private-employee-test-20261125"
new = "rmos-beget-prod-app:finance-management-20261125"
container = "rmos-beget-prod-app-1"
compose = ["docker", "compose", "-p", "rmos-beget-prod", "--env-file", str(base / "production.env")]
files = (
    "src/components/FinanceManagementPage.tsx",
    "src/components/finance-management.css",
    "src/lib/finance-management-model.ts",
    "src/lib/finance-management.functions.ts",
    "src/lib/finance-management.server.ts",
    "src/routes/_authenticated/finance.management.tsx",
)


def configuration(path):
    return json.loads(subprocess.check_output(compose + ["-f", str(path), "config", "--format", "json"]))


def live_image():
    return subprocess.check_output(
        ["docker", "inspect", "--format", "{{.Config.Image}}", container], text=True
    ).strip()


def replace_once(text, old_text, new_text):
    if text.count(old_text) != 1:
        raise RuntimeError("Source layout changed. Release stopped before activation.")
    return text.replace(old_text, new_text, 1)


def healthy(image, check_route=False):
    for _ in range(24):
        try:
            if live_image() == image:
                with urllib.request.urlopen("http://127.0.0.1:64197/api/public/health", timeout=3) as response:
                    if response.status != 200:
                        continue
                if check_route:
                    url = "http://127.0.0.1:64197/finance/management"
                    with urllib.request.urlopen(url, timeout=3) as response:
                        if response.status != 200:
                            continue
                return True
        except (OSError, subprocess.CalledProcessError):
            pass
        time.sleep(2)
    return False


def activate(revision):
    if not re.fullmatch(r"[a-f0-9]{40}", revision):
        raise RuntimeError("Expected an exact Git revision.")
    text = production.read_text()
    before = configuration(production)
    app = before["services"]["app"]
    if (live_image(), app["image"], app["build"]["context"]) != (old, old, str(source)):
        raise RuntimeError("Production changed. Check the new source and image before trying again.")
    if candidate.exists() or pending.exists() or backup.exists():
        raise RuntimeError("A prior release attempt already exists. Review its state.")

    raw = f"https://raw.githubusercontent.com/721983egor-dot/property-manager-hub/{revision}/"

    def fetch(path):
        with urllib.request.urlopen(raw + path, timeout=25) as response:
            data = response.read(200001)
        if len(data) > 200000:
            raise RuntimeError("Unexpected release source size.")
        return data.decode("utf-8")

    shutil.copytree(source, candidate, ignore=shutil.ignore_patterns(".git", ".env*", "node_modules", ".output", "dist"))
    for path in files:
        target = candidate / path
        if target.exists():
            raise RuntimeError(f"Report file already exists: {path}")
        target.write_text(fetch(path))

    fragments = json.loads(fetch("scripts/finance-management-fragments.json"))
    for file, marker, fragment, after in (
        ("src/components/FinanceAnalyticsPage.tsx", '      <FinanceTabs active={dashboard ? "dashboard" : "reports"} />\n', "link", True),
        ("src/lib/ai/tools/read.server.ts", "    listPayments: tool({", "tool", False),
    ):
        path = candidate / file
        value = fragments[fragment]
        path.write_text(replace_once(path.read_text(), marker, marker + value if after else value + marker))

    section = re.search(r"(?ms)^  app:\s*\n.*?(?=^  \w[\w-]*:\s*\n|\Z)", text)
    if not section:
        raise RuntimeError("The app service is missing.")
    updated = replace_once(section[0], f"    image: {old}\n", f"    image: {new}\n")
    updated = replace_once(updated, f"      context: {source}\n", f"      context: {candidate}\n")
    pending.write_text(text[:section.start()] + updated + text[section.end():])
    os.chmod(pending, production.stat().st_mode & 0o777)
    expected = copy.deepcopy(before)
    expected_app = expected["services"]["app"]
    expected_app["image"] = new
    expected_app["build"]["context"] = str(candidate)
    if configuration(pending) != expected:
        raise RuntimeError("Production configuration differs beyond the app image and source.")

    print("Building isolated candidate. Production is unchanged.", flush=True)
    with (work / "build.log").open("wb") as log:
        subprocess.run(compose + ["-f", str(pending), "build", "app"], stdout=log, stderr=subprocess.STDOUT, check=True)

    if production.read_text() != text or live_image() != old:
        raise RuntimeError("Production changed during the build. Activation stopped.")
    shutil.copy2(production, backup)
    os.replace(pending, production)
    command = compose + ["-f", str(production), "up", "-d", "--no-deps", "--no-build", "app"]
    with (work / "activate.log").open("ab") as log:
        try:
            subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
            if not healthy(new, check_route=True):
                raise RuntimeError("Health or the report route failed.")
        except BaseException:
            shutil.copy2(backup, pending)
            os.replace(pending, production)
            subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
            if not healthy(old):
                raise RuntimeError("Rollback attempted. Previous image health was not confirmed.")
            raise RuntimeError("Activation failed. The previous image is healthy.") from None
    print("Management report deployed. Health and report route checked. Only the app was replaced.")


if __name__ == "__main__":
    work.mkdir(mode=0o700, exist_ok=True)
    with (work / "release.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            activate(sys.argv[1])
        except (RuntimeError, subprocess.CalledProcessError) as error:
            raise SystemExit(str(error))
